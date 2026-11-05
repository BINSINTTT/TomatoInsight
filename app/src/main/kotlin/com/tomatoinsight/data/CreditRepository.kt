package com.tomatoinsight.data

import android.content.Context
import com.google.android.gms.tasks.Tasks
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.FirebaseFirestoreException
import com.google.firebase.firestore.SetOptions
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

const val SIGNUP_CREDITS = 10
const val PROFILE_BONUS_CREDITS = 5
const val SCAN_CREDIT_COST = 1

data class AccountCredits(
    val balance: Int = 0,
    val signupGranted: Boolean = false,
    val profileBonusGranted: Boolean = false,
    val updatedAt: String? = null
)

data class CreditSync(
    val account: AccountCredits,
    val profileBonusJustGranted: Boolean = false,
    val signupCreditsJustGranted: Boolean = false
)

data class CreditAction(
    val ok: Boolean,
    val code: String = "",
    val message: String = "",
    val balance: Int = 0,
    val added: Int = 0,
    val account: AccountCredits? = null,
    val paymentSaved: Boolean = false,
    val paymentRulesHint: Boolean = false,
    val queuedOffline: Boolean = false
)

data class CreditPack(
    val id: String,
    val name: String,
    val credits: Int,
    val listPricePhp: Double,
    val audience: String,
    val features: List<String>,
    val ctaLabel: String,
    val featured: Boolean = false
)

/** Affordable PHP packs for local farmers (demo checkout still charges ₱0). */
val CREDIT_PACKS = listOf(
    CreditPack(
        id = "starter",
        name = "Starter",
        credits = 10,
        listPricePhp = 49.0,
        audience = "Small farms getting started",
        features = listOf(
            "10 scan credits",
            "Leaf disease classification",
            "Farm blueprint tiles",
            "Care recommendations",
            "Home dashboard access"
        ),
        ctaLabel = "Choose Plan"
    ),
    CreditPack(
        id = "grower",
        name = "Grower",
        credits = 25,
        listPricePhp = 99.0,
        audience = "Busy farms with regular scans",
        features = listOf(
            "25 scan credits",
            "Leaf disease classification",
            "Farm blueprint tiles",
            "Care recommendations",
            "Scan history & monitoring",
            "Week reminders",
            "~₱4.00 per scan"
        ),
        ctaLabel = "Get started",
        featured = true
    ),
    CreditPack(
        id = "season",
        name = "Season",
        credits = 50,
        listPricePhp = 149.0,
        audience = "Full-season coverage for larger plots",
        features = listOf(
            "50 scan credits",
            "Best value per scan (~₱3)",
            "All Grower features",
            "Season-long tracking",
            "Priority pack size"
        ),
        ctaLabel = "Choose Plan"
    )
)

data class PaymentRecord(
    val id: String,
    val packName: String,
    val credits: Int,
    val amountChargedPhp: Double,
    val createdAt: String,
    val createdAtMs: Long
)

data class PaymentListResult(
    val rows: List<PaymentRecord> = emptyList(),
    val error: String? = null
)

sealed class ScanSaveOutcome {
    object Saved : ScanSaveOutcome()
    data class Blocked(val code: String, val message: String) : ScanSaveOutcome()
}

fun isFarmSetupComplete(
    profile: FarmerProfile,
    tileCount: Int,
    scanCount: Int,
    farmWeek: Int?
): Boolean {
    return profile.firstName.trim().isNotEmpty() &&
        profile.lastName.trim().isNotEmpty() &&
        profile.farmName.trim().isNotEmpty() &&
        profile.photo != null &&
        tileCount > 0 &&
        scanCount > 0 &&
        farmWeek != null
}

fun remainingCreditsLine(balance: Int): String {
    val left = balance.coerceAtLeast(0)
    return if (left == 1) "You have 1 credit remaining." else "You have $left credits remaining."
}

fun formatPhp(amount: Double): String {
    val rounded = kotlin.math.round(amount * 100.0) / 100.0
    return if (rounded == rounded.toLong().toDouble()) {
        "₱${rounded.toLong()}"
    } else {
        "₱" + String.format(Locale.US, "%.2f", rounded)
    }
}

/** @deprecated Prefer [formatPhp]. */
fun formatUsd(amount: Double): String = formatPhp(amount)

class CreditRepository(context: Context) {
    private val prefs = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    private val db = FirebaseFirestore.getInstance()
    private val spendLock = Mutex()

    fun readCache(uid: String): AccountCredits? {
        if (!prefs.getBoolean(hasKey(uid), false)) return null
        return AccountCredits(
            balance = prefs.getInt(balanceKey(uid), 0).coerceAtLeast(0),
            signupGranted = prefs.getBoolean(signupKey(uid), false),
            profileBonusGranted = prefs.getBoolean(bonusKey(uid), false),
            updatedAt = prefs.getString(updatedKey(uid), null)
        )
    }

    /** Last server balance minus saves that happened while the phone was offline. */
    fun overlayPending(uid: String, account: AccountCredits): AccountCredits {
        val pending = pendingSpendCount(uid)
        if (pending <= 0) return account
        return account.copy(balance = (account.balance - pending).coerceAtLeast(0))
    }

    fun visibleAccount(uid: String): AccountCredits? =
        readCache(uid)?.let { overlayPending(uid, it) }

    fun pendingSpendCount(uid: String): Int =
        prefs.getInt(pendingKey(uid), 0).coerceAtLeast(0)

    fun claimToast(uid: String, kind: String): Boolean {
        val key = "toast_${kind}_$uid"
        if (prefs.getBoolean(key, false)) return false
        prefs.edit().putBoolean(key, true).apply()
        return true
    }

    fun observe(uid: String): Flow<AccountCredits> = callbackFlow {
        val registration = db.collection("users").document(uid).addSnapshotListener { snap, error ->
            if (error != null) return@addSnapshotListener
            val raw = snap?.get("credits").asStringMap() ?: return@addSnapshotListener
            val account = raw.toAccountCredits()
            writeCache(uid, account)
            trySend(overlayPending(uid, account))
        }
        awaitClose { registration.remove() }
    }

    suspend fun ensureAccountCredits(
        uid: String,
        profile: FarmerProfile = FarmerProfile(),
        tileCount: Int = 0,
        scanCount: Int = 0,
        farmWeek: Int? = null,
        grantProfileBonus: Boolean = false
    ): CreditSync = withContext(Dispatchers.IO) {
        val userRef = db.collection("users").document(uid)
        val initial = Tasks.await(userRef.get())
        val previous = initial.get("credits").asStringMap().toAccountCredits()
        val preview = applyGrants(previous, profile, tileCount, scanCount, farmWeek, grantProfileBonus)
        if (initial.exists() && sameCredits(previous, preview.node)) {
            writeCache(uid, previous)
            return@withContext CreditSync(account = previous)
        }

        var grantedInTransaction = false
        Tasks.await(db.runTransaction { transaction ->
            val snap = transaction.get(userRef)
            val current = snap.get("credits").asStringMap().toAccountCredits()
            val next = applyGrants(current, profile, tileCount, scanCount, farmWeek, grantProfileBonus)
            grantedInTransaction = grantProfileBonus && next.profileBonusJustGranted
            if (snap.exists() && sameCredits(current, next.node)) return@runTransaction
            transaction.set(userRef, mapOf("credits" to next.node.toMap()), SetOptions.merge())
        })

        val after = Tasks.await(userRef.get())
        val stored = after.get("credits").asStringMap().toAccountCredits()
        if (!after.exists() || !stored.signupGranted) {
            throw IllegalStateException("Credit balance was not saved.")
        }
        writeCache(uid, stored)
        CreditSync(
            account = overlayPending(uid, stored),
            profileBonusJustGranted = grantedInTransaction,
            signupCreditsJustGranted = !previous.signupGranted && stored.signupGranted
        )
    }

    /**
     * Uses Firestore when reachable. If the phone is offline, spends against the
     * last cached balance and queues that deduction until the next sync.
     */
    suspend fun spendForSuccessfulScan(
        uid: String,
        offline: Boolean = false
    ): CreditAction = withContext(Dispatchers.IO) {
        spendLock.withLock {
            if (offline) return@withLock spendFromCache(uid)
            try {
                ensureAccountCredits(uid)
            } catch (_: Exception) {
                return@withLock spendFromCache(uid)
            }

            val userRef = db.collection("users").document(uid)
            try {
                val stored = Tasks.await(db.runTransaction { transaction ->
                    val snap = transaction.get(userRef)
                    val node = snap.get("credits").asStringMap().toAccountCredits()
                    val pending = pendingSpendCount(uid)
                    if (!node.signupGranted || node.balance - pending < SCAN_CREDIT_COST) {
                        throw IllegalStateException("insufficient-credits")
                    }
                    val next = node.copy(
                        balance = node.balance - SCAN_CREDIT_COST,
                        updatedAt = isoNow()
                    )
                    transaction.set(userRef, mapOf("credits" to next.toMap()), SetOptions.merge())
                    next
                })
                writeCache(uid, stored)
                val visible = overlayPending(uid, stored)
                CreditAction(ok = true, balance = visible.balance, account = visible)
            } catch (error: Exception) {
                if (error.containsReason("insufficient-credits")) {
                    val snap = runCatching { Tasks.await(userRef.get()) }.getOrNull()
                    val stored = snap?.get("credits").asStringMap()?.toAccountCredits()
                    if (stored?.signupGranted == true) writeCache(uid, stored)
                    val visible = stored?.let { overlayPending(uid, it) }
                    return@withLock CreditAction(
                        ok = false,
                        code = "insufficient-credits",
                        balance = visible?.balance ?: 0,
                        account = visible,
                        message = "A successful scan uses 1 credit. You have none left."
                    )
                }
                spendFromCache(uid)
            }
        }
    }

    suspend fun refundScanCredit(
        uid: String,
        queuedOffline: Boolean = false
    ): AccountCredits? = withContext(Dispatchers.IO) {
        spendLock.withLock {
            if (queuedOffline) {
                addPendingSpend(uid, -SCAN_CREDIT_COST)
                return@withLock visibleAccount(uid)
            }
            val userRef = db.collection("users").document(uid)
            try {
                val stored = Tasks.await(db.runTransaction { transaction ->
                    val snap = transaction.get(userRef)
                    val node = snap.get("credits").asStringMap().toAccountCredits()
                    if (!node.signupGranted) return@runTransaction node
                    val next = node.copy(balance = node.balance + SCAN_CREDIT_COST, updatedAt = isoNow())
                    transaction.set(userRef, mapOf("credits" to next.toMap()), SetOptions.merge())
                    next
                })
                if (stored.signupGranted) writeCache(uid, stored)
                overlayPending(uid, stored)
            } catch (_: Exception) {
                visibleAccount(uid)
            }
        }
    }

    /** Pushes queued offline deductions onto the website credit balance. */
    suspend fun applyPendingSpends(uid: String): CreditSync = withContext(Dispatchers.IO) {
        spendLock.withLock {
            val ensured = try {
                ensureAccountCredits(uid)
            } catch (error: Exception) {
                throw error
            }
            val pending = pendingSpendCount(uid)
            if (pending <= 0) return@withLock ensured

            val userRef = db.collection("users").document(uid)
            val stored = Tasks.await(db.runTransaction { transaction ->
                val snap = transaction.get(userRef)
                val node = snap.get("credits").asStringMap().toAccountCredits()
                if (!node.signupGranted) return@runTransaction node
                val next = node.copy(
                    balance = (node.balance - pending).coerceAtLeast(0),
                    updatedAt = isoNow()
                )
                transaction.set(userRef, mapOf("credits" to next.toMap()), SetOptions.merge())
                next
            })
            writePendingSpend(uid, 0)
            writeCache(uid, stored)
            CreditSync(account = stored)
        }
    }

    /**
     * Credits are written first. The payments row is a separate write so a
     * denied payments rule cannot roll back the balance.
     */
    suspend fun addTopUpCredits(uid: String, pack: CreditPack): CreditAction = withContext(Dispatchers.IO) {
        if (pack.credits < 1) {
            return@withContext CreditAction(ok = false, code = "invalid-amount", message = "Choose a valid credit pack.")
        }
        try {
            ensureAccountCredits(uid)
        } catch (_: Exception) {
            return@withContext CreditAction(
                ok = false,
                code = "credits-unavailable",
                message = "Could not reach your credit balance. Try again."
            )
        }

        val userRef = db.collection("users").document(uid)
        val now = Date()
        val stored = try {
            Tasks.await(db.runTransaction { transaction ->
                val snap = transaction.get(userRef)
                val node = snap.get("credits").asStringMap().toAccountCredits()
                if (!node.signupGranted) throw IllegalStateException("credits-missing")
                val next = node.copy(balance = node.balance + pack.credits, updatedAt = isoTimestamp(now.time))
                transaction.set(userRef, mapOf("credits" to next.toMap()), SetOptions.merge())
                node.balance to next
            })
        } catch (error: Exception) {
            return@withContext CreditAction(
                ok = false,
                code = "credits-unavailable",
                message = demoCheckoutErrorMessage(error)
            )
        }

        val balanceBefore = stored.first
        val after = stored.second
        val payment = hashMapOf<String, Any>(
            "uid" to uid,
            "email" to (FirebaseAuth.getInstance().currentUser?.email ?: ""),
            "packId" to pack.id,
            "packName" to pack.name,
            "credits" to pack.credits,
            "listPricePhp" to pack.listPricePhp,
            "amountChargedPhp" to 0,
            "currency" to "PHP",
            "status" to "paid",
            "method" to "demo",
            "isDemo" to true,
            "createdAt" to isoTimestamp(now.time),
            "createdAtMs" to now.time,
            "balanceBefore" to balanceBefore,
            "balanceAfter" to after.balance
        )
        var paymentSaved = true
        var rulesHint = false
        try {
            Tasks.await(db.collection("payments").document().set(payment))
        } catch (error: Exception) {
            paymentSaved = false
            rulesHint = error.isPermissionDenied()
        }
        writeCache(uid, after)
        val visible = overlayPending(uid, after)
        CreditAction(
            ok = true,
            balance = visible.balance,
            added = pack.credits,
            account = visible,
            paymentSaved = paymentSaved,
            paymentRulesHint = rulesHint
        )
    }

    suspend fun listPayments(uid: String): PaymentListResult = withContext(Dispatchers.IO) {
        try {
            val snap = Tasks.await(db.collection("payments").whereEqualTo("uid", uid).get())
            val rows = snap.documents.map { doc ->
                val data = doc.data.orEmpty()
                PaymentRecord(
                    id = doc.id,
                    packName = data["packName"].asText().ifBlank { "Credits" },
                    credits = data["credits"].asInt() ?: 0,
                    amountChargedPhp = data["amountChargedPhp"].asDouble()
                        ?: data["amountChargedUsd"].asDouble()
                        ?: 0.0,
                    createdAt = data["createdAt"].asText(),
                    createdAtMs = data["createdAtMs"].asLong() ?: 0L
                )
            }.sortedByDescending { it.createdAtMs }
            PaymentListResult(rows = rows)
        } catch (_: Exception) {
            PaymentListResult(
                error = "Could not load purchases. Check Firestore rules for the payments collection."
            )
        }
    }

    private fun spendFromCache(uid: String): CreditAction {
        val cached = readCache(uid)
        if (cached == null || !cached.signupGranted) {
            return CreditAction(
                ok = false,
                code = "credits-unavailable",
                message = "Connect once to load your scan credits, then you can save while offline."
            )
        }
        val visible = overlayPending(uid, cached)
        if (visible.balance < SCAN_CREDIT_COST) {
            return CreditAction(
                ok = false,
                code = "insufficient-credits",
                balance = visible.balance,
                account = visible,
                message = "A successful scan uses 1 credit. You have none left."
            )
        }
        addPendingSpend(uid, SCAN_CREDIT_COST)
        val after = overlayPending(uid, cached)
        return CreditAction(
            ok = true,
            balance = after.balance,
            account = after,
            queuedOffline = true
        )
    }

    private fun addPendingSpend(uid: String, amount: Int) {
        writePendingSpend(uid, (pendingSpendCount(uid) + amount).coerceAtLeast(0))
    }

    private fun writePendingSpend(uid: String, amount: Int) {
        prefs.edit().putInt(pendingKey(uid), amount.coerceAtLeast(0)).apply()
    }

    private fun writeCache(uid: String, account: AccountCredits) {
        prefs.edit()
            .putBoolean(hasKey(uid), true)
            .putInt(balanceKey(uid), account.balance)
            .putBoolean(signupKey(uid), account.signupGranted)
            .putBoolean(bonusKey(uid), account.profileBonusGranted)
            .putString(updatedKey(uid), account.updatedAt)
            .apply()
    }

    private fun applyGrants(
        current: AccountCredits,
        profile: FarmerProfile,
        tileCount: Int,
        scanCount: Int,
        farmWeek: Int?,
        grantProfileBonus: Boolean
    ): GrantResult {
        var balance = current.balance
        var signupGranted = current.signupGranted
        var profileBonusGranted = current.profileBonusGranted
        var justGranted = false
        if (!signupGranted) {
            balance += SIGNUP_CREDITS
            signupGranted = true
        }
        if (
            grantProfileBonus &&
            isFarmSetupComplete(profile, tileCount, scanCount, farmWeek) &&
            !profileBonusGranted
        ) {
            balance += PROFILE_BONUS_CREDITS
            profileBonusGranted = true
            justGranted = true
        }
        return GrantResult(
            node = AccountCredits(
                balance = balance.coerceAtLeast(0),
                signupGranted = signupGranted,
                profileBonusGranted = profileBonusGranted,
                updatedAt = isoNow()
            ),
            profileBonusJustGranted = justGranted
        )
    }

    private fun sameCredits(left: AccountCredits, right: AccountCredits): Boolean {
        return left.balance == right.balance &&
            left.signupGranted == right.signupGranted &&
            left.profileBonusGranted == right.profileBonusGranted
    }

    private fun demoCheckoutErrorMessage(error: Exception): String {
        if (error.isPermissionDenied()) {
            return "Firestore blocked this update. Publish the credit and payments rules, then try again."
        }
        return "Could not complete the demo payment. Try again."
    }

    private data class GrantResult(
        val node: AccountCredits,
        val profileBonusJustGranted: Boolean
    )

    companion object {
        private const val PREFS = "tomato_insight_credits"
        private fun hasKey(uid: String) = "has_$uid"
        private fun balanceKey(uid: String) = "bal_$uid"
        private fun signupKey(uid: String) = "signup_$uid"
        private fun bonusKey(uid: String) = "bonus_$uid"
        private fun updatedKey(uid: String) = "at_$uid"
        private fun pendingKey(uid: String) = "pending_$uid"
    }
}

private fun AccountCredits.toMap(): Map<String, Any> {
    val fields = mutableMapOf<String, Any>(
        "balance" to balance,
        "signupGranted" to signupGranted,
        "profileBonusGranted" to profileBonusGranted,
        "updatedAt" to (updatedAt ?: isoNow())
    )
    return fields
}

private fun Map<String, Any?>?.toAccountCredits(): AccountCredits {
    val balance = this?.get("balance").asInt() ?: 0
    return AccountCredits(
        balance = if (balance > 0) balance else 0,
        signupGranted = this?.get("signupGranted") == true,
        profileBonusGranted = this?.get("profileBonusGranted") == true,
        updatedAt = this?.get("updatedAt").asText().ifBlank { null }
    )
}

private fun Any?.asStringMap(): Map<String, Any?>? {
    val raw = this as? Map<*, *> ?: return null
    return raw.entries.mapNotNull { (key, value) ->
        val name = key as? String ?: return@mapNotNull null
        name to value
    }.toMap()
}

private fun Any?.asText(): String = this as? String ?: ""

private fun Any?.asInt(): Int? = when (this) {
    is Int -> this
    is Long -> this.toInt()
    is Double -> this.toInt()
    is Float -> this.toInt()
    else -> null
}

private fun Any?.asLong(): Long? = when (this) {
    is Long -> this
    is Int -> this.toLong()
    is Double -> this.toLong()
    else -> null
}

private fun Any?.asDouble(): Double? = when (this) {
    is Double -> this
    is Float -> this.toDouble()
    is Long -> this.toDouble()
    is Int -> this.toDouble()
    else -> null
}

private fun isoNow(): String = isoTimestamp(System.currentTimeMillis())

private fun isoTimestamp(millis: Long): String =
    SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
        timeZone = TimeZone.getTimeZone("UTC")
    }.format(Date(millis))

private fun Throwable.containsReason(reason: String): Boolean {
    var current: Throwable? = this
    while (current != null) {
        if (current.message?.contains(reason) == true) return true
        current = current.cause
    }
    return false
}

private fun Throwable.isPermissionDenied(): Boolean {
    var current: Throwable? = this
    while (current != null) {
        val code = (current as? FirebaseFirestoreException)?.code
        if (code == FirebaseFirestoreException.Code.PERMISSION_DENIED) return true
        current = current.cause
    }
    return false
}
