package com.tomatoinsight.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.tomatoinsight.data.CREDIT_PACKS
import com.tomatoinsight.data.CreditPack
import com.tomatoinsight.data.PaymentRecord
import com.tomatoinsight.data.formatPhp
import com.tomatoinsight.ui.components.CreditPackCard
import com.tomatoinsight.ui.components.CustomBottomBar
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone

private val PageBg = Color(0xFFF4F6F8)
private val Ink = Color(0xFF243046)
private val Muted = Color(0xFF667085)
private val Accent = Color(0xFFE53935)
private val Line = Color(0x1A243046)

@Composable
fun CreditPlansScreen(
    balance: Int?,
    payments: List<PaymentRecord>,
    paymentsNote: String?,
    onBack: () -> Unit,
    onSelectPack: (CreditPack) -> Unit,
    onNavigateToHome: () -> Unit,
    onNavigateToMonitoring: () -> Unit,
    onNavigateToHistory: () -> Unit,
    onNavigateToProfile: () -> Unit,
    onCameraClick: () -> Unit
) {
    val low = balance != null && balance <= 0
    Scaffold(
        containerColor = PageBg,
        bottomBar = {
            CustomBottomBar(
                selectedTab = "profile",
                onHomeClick = onNavigateToHome,
                onMonitoringClick = onNavigateToMonitoring,
                onCameraClick = onCameraClick,
                onHistoryClick = onNavigateToHistory,
                onProfileClick = onNavigateToProfile
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 16.dp, vertical = 8.dp)
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = onBack) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                }
                Text(
                    text = "Credit plans",
                    fontWeight = FontWeight.Bold,
                    fontSize = 24.sp,
                    color = Ink,
                    modifier = Modifier.weight(1f)
                )
            }

            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 8.dp)
                    .background(Color.White, RoundedCornerShape(16.dp))
                    .border(1.dp, Line, RoundedCornerShape(16.dp))
                    .padding(horizontal = 16.dp, vertical = 14.dp)
            ) {
                Text(
                    text = "YOUR BALANCE",
                    color = Muted,
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Bold,
                    letterSpacing = 1.sp
                )
                Text(
                    text = balance?.toString() ?: "—",
                    fontWeight = FontWeight.ExtraBold,
                    fontSize = 30.sp,
                    color = if (low) Color(0xFFB71C1C) else Ink
                )
            }

            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 16.dp)
                    .background(
                        Brush.verticalGradient(
                            listOf(Color(0xFFFFF8F7), Color(0xFFFFE8E4))
                        ),
                        RoundedCornerShape(20.dp)
                    )
                    .border(1.dp, Color(0x1FE53935), RoundedCornerShape(20.dp))
                    .padding(16.dp)
            ) {
                Text(
                    text = "TOP UP",
                    color = Accent,
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Bold,
                    letterSpacing = 1.2.sp
                )
                Text(
                    text = "Choose a pack",
                    fontWeight = FontWeight.Bold,
                    fontSize = 18.sp,
                    color = Ink,
                    modifier = Modifier.padding(top = 4.dp, bottom = 12.dp)
                )
                CREDIT_PACKS.forEach { pack ->
                    CreditPackCard(pack = pack, onSelect = { onSelectPack(pack) })
                    Spacer(modifier = Modifier.height(12.dp))
                }
            }

            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 16.dp)
                    .background(Color.White, RoundedCornerShape(20.dp))
                    .border(1.dp, Line, RoundedCornerShape(20.dp))
                    .padding(16.dp)
            ) {
                Text(
                    text = "PURCHASES",
                    color = Accent,
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Bold,
                    letterSpacing = 1.2.sp
                )
                Text(
                    text = "Demo payment history",
                    fontWeight = FontWeight.Bold,
                    fontSize = 18.sp,
                    color = Ink,
                    modifier = Modifier.padding(top = 4.dp, bottom = 10.dp)
                )
                if (payments.isEmpty()) {
                    Text(
                        text = paymentsNote
                            ?: "No demo payments yet. Complete checkout above to create one.",
                        color = Muted,
                        fontSize = 14.sp,
                        lineHeight = 20.sp
                    )
                } else {
                    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        payments.take(12).forEach { row ->
                            Column(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .background(Color(0xFFF5F5F4), RoundedCornerShape(14.dp))
                                    .border(1.dp, Line, RoundedCornerShape(14.dp))
                                    .padding(horizontal = 14.dp, vertical = 12.dp)
                            ) {
                                Text(
                                    text = "${row.packName} · +${row.credits}",
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 15.sp,
                                    color = Ink
                                )
                                Text(
                                    text = "${formatPhp(row.amountChargedPhp)} demo · ${formatPaymentWhen(row.createdAt)}",
                                    color = Muted,
                                    fontSize = 13.sp,
                                    modifier = Modifier.padding(top = 2.dp)
                                )
                            }
                        }
                    }
                }
            }

            Text(
                text = "← Back to profile",
                color = Accent,
                fontWeight = FontWeight.SemiBold,
                fontSize = 14.sp,
                modifier = Modifier
                    .padding(top = 20.dp, bottom = 16.dp)
                    .clickable(onClick = onBack)
            )
        }
    }
}

private fun formatPaymentWhen(iso: String): String {
    if (iso.isBlank()) return ""
    val patterns = listOf("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", "yyyy-MM-dd'T'HH:mm:ss'Z'")
    val parsed = patterns.firstNotNullOfOrNull { pattern ->
        runCatching {
            SimpleDateFormat(pattern, Locale.US).apply {
                timeZone = TimeZone.getTimeZone("UTC")
            }.parse(iso)
        }.getOrNull()
    } ?: return iso
    return SimpleDateFormat("MMM d, yyyy, h:mm a", Locale.getDefault()).format(parsed)
}
