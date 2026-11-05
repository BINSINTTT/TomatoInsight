package com.tomatoinsight.data

import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale
import kotlin.math.round

private const val WEEK_DAYS = 7

data class DueScanReminder(
    val tileNumber: Int,
    val nextWeek: Int
)

/** Active calendar day used for testing and reminders (selected → next due → anchor → today). */
fun ScanCalendar.asOfIso(): String {
    if (!enabled) return todayIsoLocal()
    if (selected.isNotBlank() && parseScanDay(selected) != null) return selected
    if (nextDue.isNotBlank() && parseScanDay(nextDue) != null) return nextDue
    if (anchor.isNotBlank() && parseScanDay(anchor) != null) return anchor
    return todayIsoLocal()
}

fun ScanCalendar.weekNumberForIso(iso: String): Int {
    if (anchor.isBlank() || iso.isBlank()) return FIRST_FARM_WEEK
    val days = daysBetweenIso(anchor, iso) ?: return FIRST_FARM_WEEK
    if (days < 0) return FIRST_FARM_WEEK
    return (FIRST_FARM_WEEK + days / WEEK_DAYS).coerceAtMost(LAST_FARM_WEEK)
}

/** Noon on the calendar "as of" day when custom dates are on; otherwise wall-clock now. */
fun ScanCalendar.savedAtMillisForScan(): Long {
    if (!enabled) return System.currentTimeMillis()
    val day = parseScanDay(asOfIso()) ?: return System.currentTimeMillis()
    return Calendar.getInstance().apply {
        timeInMillis = day
        set(Calendar.HOUR_OF_DAY, 12)
        set(Calendar.MINUTE, 0)
        set(Calendar.SECOND, 0)
        set(Calendar.MILLISECOND, 0)
    }.timeInMillis
}

/**
 * Next week for one plant — same rules as website `reminderWeekForPlant`.
 * Uses that tile's scan day; custom calendar "as of" date for testing.
 */
fun reminderWeekForPlant(
    calendar: ScanCalendar,
    latestWeek: Int?,
    scannedAtMillis: Long,
    scanDayIso: String? = null
): Int? {
    if (!calendar.enabled || calendar.anchor.isBlank()) return null
    val week = latestWeek ?: return null
    val nextWeek = week + 1
    if (nextWeek > LAST_FARM_WEEK) return null

    val referenceIso = calendar.asOfIso()
    val referenceWeek = calendar.weekNumberForIso(referenceIso)
    if (referenceWeek < nextWeek) return null

    val scanIso = scanDayIso?.takeIf { parseScanDay(it) != null }
        ?: isoFromMillisLocal(scannedAtMillis).takeIf { it.isNotBlank() }
        .orEmpty()
    if (scanIso.isNotBlank()) {
        val waited = daysBetweenIso(scanIso, referenceIso)
        if (waited != null && waited >= WEEK_DAYS) return nextWeek
    }

    val sinceAnchor = daysBetweenIso(calendar.anchor, referenceIso)
    if (sinceAnchor != null && sinceAnchor >= WEEK_DAYS) return nextWeek

    return null
}

/** Tiles that still need their next weekly scan, matching website farm-notifications.js. */
fun dueScanReminders(
    calendar: ScanCalendar,
    history: Map<Int, List<TileScanResult>>
): List<DueScanReminder> {
    if (!calendar.enabled || calendar.anchor.isBlank()) return emptyList()
    return history.keys.sorted().mapNotNull { tile ->
        val scans = history.scansFor(tile)
        if (scans.isEmpty()) return@mapNotNull null
        val latest = scans.first()
        val latestWeek = latest.weekNumber ?: return@mapNotNull null
        val nextWeek = reminderWeekForPlant(
            calendar = calendar,
            latestWeek = latestWeek,
            scannedAtMillis = latest.scannedAtMillis,
            scanDayIso = latest.scanDayIso
        ) ?: return@mapNotNull null
        val savedWeeks = scans.mapNotNull { it.weekNumber }.toSet()
        if (nextWeek in savedWeeks) return@mapNotNull null
        DueScanReminder(tileNumber = tile, nextWeek = nextWeek)
    }
}

fun daysBetweenIso(startIso: String, endIso: String): Int? {
    val start = parseScanDay(startIso) ?: return null
    val end = parseScanDay(endIso) ?: return null
    return round((end - start) / 86_400_000.0).toInt()
}

fun todayIsoLocal(): String = isoFromMillisLocal(System.currentTimeMillis())

fun isoFromMillisLocal(millis: Long): String {
    val cal = Calendar.getInstance().apply { timeInMillis = millis }
    return "%04d-%02d-%02d".format(
        cal.get(Calendar.YEAR),
        cal.get(Calendar.MONTH) + 1,
        cal.get(Calendar.DAY_OF_MONTH)
    )
}

fun parseScanDay(iso: String): Long? {
    if (!Regex("\\d{4}-\\d{2}-\\d{2}").matches(iso)) return null
    return runCatching {
        SimpleDateFormat("yyyy-MM-dd", Locale.US).apply { isLenient = false }.parse(iso)?.time
    }.getOrNull()
}

fun formatScanDueLabel(iso: String): String {
    val parsed = parseScanDay(iso) ?: return iso
    return SimpleDateFormat("MMMM d", Locale.getDefault()).format(Date(parsed)).uppercase(Locale.getDefault())
}
