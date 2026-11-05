package com.tomatoinsight.ui.screens

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.tween
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.produceState
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.platform.LocalContext
import com.tomatoinsight.api.ImageUploadHelper
import com.tomatoinsight.api.ValidationResponse
import com.tomatoinsight.util.hasValidatedInternet
import com.tomatoinsight.util.observeValidatedInternet
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeout
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import com.tomatoinsight.api.diseaseDisplayLabel
import com.tomatoinsight.data.FIRST_FARM_WEEK
import com.tomatoinsight.data.FarmDeletion
import com.tomatoinsight.data.LAST_FARM_WEEK
import com.tomatoinsight.data.SavedRecommendation
import com.tomatoinsight.data.ScanCalendar
import com.tomatoinsight.data.TileScanHistory
import com.tomatoinsight.data.TileScanResult
import com.tomatoinsight.data.asSavedValidationResponse
import com.tomatoinsight.data.ensureGuidesForAllDetections
import com.tomatoinsight.ui.components.ConnectionStatusIndicator
import com.tomatoinsight.ui.components.CustomBottomBar
import com.tomatoinsight.ui.components.InternetConnectionNotice
import com.tomatoinsight.ui.components.DiseaseTreatmentCard
import com.tomatoinsight.ui.components.HealthStatusCard

private val PageBackground = Color(0xFFF4F6F8)
private val Ink = Color(0xFF222222)
private val Muted = Color(0xFF757575)
private val CardBorder = Color(0xFF14213D).copy(alpha = 0.08f)
private val CardBorderStrong = Color(0xFF14213D).copy(alpha = 0.12f)
private val RecordsHeadBg = Color(0xFFFAFAFA)
private val RowDivider = Color(0xFF14213D).copy(alpha = 0.06f)
private val TomatoShell = Color(0xFF9B2B26)
private val StatusOkBg = Color(0xFFE8F5E9)
private val StatusOkFg = Color(0xFF1B5E20)
private val StatusIssueBg = Color(0xFFFFEBEE)
private val StatusIssueFg = Color(0xFFB71C1C)
private val StatusSavedBg = Color(0xFFECEFF1)
private val StatusSavedFg = Color(0xFF546E7A)
private val StatusDeletedBg = Color(0xFFFBE9E7)
private val StatusDeletedFg = Color(0xFF6D4C41)

private enum class HistoryFilter(val label: String) {
    All("All records"),
    Healthy("Healthy only"),
    Issues("Issues"),
    Deleted("Deleted plants")
}

@Composable
fun HistoryScreen(
    onNavigateToHome: () -> Unit,
    onNavigateToMonitoring: () -> Unit,
    onNavigateToProfile: () -> Unit,
    onCameraClick: () -> Unit,
    tileScanHistory: TileScanHistory = emptyMap(),
    plantNames: Map<Int, String> = emptyMap(),
    recommendations: Map<Int, SavedRecommendation> = emptyMap(),
    deletions: List<FarmDeletion> = emptyList(),
    selectedFarmWeek: Int = FIRST_FARM_WEEK,
    scanCalendar: ScanCalendar = ScanCalendar(),
    cloudError: String? = null,
    onWeekSelected: (Int) -> Unit = {},
    onRecommendationSaved: (TileScanResult, ValidationResponse) -> Unit = { _, _ -> }
) {
    var weekMenu by remember { mutableStateOf(false) }
    var filterMenu by remember { mutableStateOf(false) }
    var filter by remember { mutableStateOf(HistoryFilter.All) }
    var openScan by remember { mutableStateOf<TileScanResult?>(null) }

    val week = selectedFarmWeek.coerceIn(FIRST_FARM_WEEK, LAST_FARM_WEEK)
    val savedTiles = tileScanHistory.filterValues { it.isNotEmpty() }
    val weekRows = savedTiles.mapNotNull { (tile, scans) ->
        scans.filter { it.weekNumber == week }
            .maxByOrNull { it.scannedAtMillis }
            ?.let { tile to it }
    }.sortedByDescending { (_, scan) -> scan.scannedAtMillis }

    val visibleScans = when (filter) {
        HistoryFilter.Deleted -> emptyList()
        HistoryFilter.Healthy -> weekRows.filter { (_, scan) -> scan.isHealthy }
        HistoryFilter.Issues -> weekRows.filter { (_, scan) -> !scan.isHealthy && scan.percent > 0 }
        HistoryFilter.All -> weekRows
    }
    val showDeleted = filter == HistoryFilter.All || filter == HistoryFilter.Deleted
    val notificationCount = savedTiles.keys.sumOf { tile ->
        tileNotificationMessages(tile, tileScanHistory, scanCalendar).size
    }

    androidx.compose.material3.Scaffold(
        containerColor = PageBackground,
        bottomBar = {
            CustomBottomBar(
                selectedTab = "history",
                cameraEnabled = false,
                onHomeClick = onNavigateToHome,
                onMonitoringClick = onNavigateToMonitoring,
                onCameraClick = onCameraClick,
                onHistoryClick = { },
                onProfileClick = onNavigateToProfile
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = 16.dp)
                .padding(bottom = 12.dp)
        ) {
            InternetConnectionNotice(
                modifier = Modifier.padding(top = 8.dp)
            )
            if (!cloudError.isNullOrBlank()) {
                Text(
                    text = cloudError,
                    fontSize = 12.sp,
                    color = StatusIssueFg,
                    modifier = Modifier.padding(top = 4.dp)
                )
            }
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 8.dp, bottom = 8.dp),
                horizontalArrangement = Arrangement.End,
                verticalAlignment = Alignment.CenterVertically
            ) {
                ConnectionStatusIndicator()
            }

            Column(
                modifier = Modifier.fillMaxSize(),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    HistorySummaryStatCard(label = "Notifications", value = notificationCount)
                    HistorySummaryStatCard(label = "Scanned tiles", value = savedTiles.size)
                    HistorySummaryStatCard(label = "Deleted plants", value = deletions.size)
                }

                Card(
                    modifier = Modifier.fillMaxWidth().weight(1f),
                    shape = RoundedCornerShape(14.dp),
                    colors = CardDefaults.cardColors(containerColor = Color.White),
                    border = BorderStroke(1.dp, CardBorder),
                    elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
                ) {
                    Column(modifier = Modifier.fillMaxSize()) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .background(RecordsHeadBg)
                                .padding(horizontal = 16.dp, vertical = 14.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                text = "Records",
                                fontWeight = FontWeight.SemiBold,
                                fontSize = 15.sp,
                                color = Ink,
                                modifier = Modifier.weight(1f)
                            )
                            HistoryMenu(
                                label = "Week $week",
                                expanded = weekMenu,
                                onExpand = { weekMenu = true },
                                onDismiss = { weekMenu = false }
                            ) {
                                (FIRST_FARM_WEEK..LAST_FARM_WEEK).forEach { option ->
                                    DropdownMenuItem(
                                        text = { Text("Week $option") },
                                        onClick = {
                                            weekMenu = false
                                            if (option != week) onWeekSelected(option)
                                        }
                                    )
                                }
                            }
                            Spacer(modifier = Modifier.width(8.dp))
                            HistoryMenu(
                                label = filter.label,
                                expanded = filterMenu,
                                onExpand = { filterMenu = true },
                                onDismiss = { filterMenu = false }
                            ) {
                                HistoryFilter.entries.forEach { option ->
                                    DropdownMenuItem(
                                        text = { Text(option.label) },
                                        onClick = {
                                            filter = option
                                            filterMenu = false
                                        }
                                    )
                                }
                            }
                        }
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(1.dp)
                                .background(CardBorder)
                        )

                        if (visibleScans.isEmpty() && (!showDeleted || deletions.isEmpty())) {
                            Text(
                                text = when {
                                    filter == HistoryFilter.Deleted -> "No plants have been deleted yet."
                                    weekRows.isEmpty() ->
                                        "No scans saved for Week $week yet. Open a tile on Home, run a scan, and tap Save Info."
                                    else -> "No scans match this filter for the selected week."
                                },
                                fontSize = 14.sp,
                                color = Muted,
                                lineHeight = 21.sp,
                                modifier = Modifier.padding(horizontal = 16.dp, vertical = 20.dp)
                            )
                        } else {
                            val tableScroll = rememberScrollState()
                            val tableWidth = HistoryTableColumns.total
                            Box(
                                modifier = Modifier
                                    .fillMaxSize()
                                    .horizontalScroll(tableScroll)
                            ) {
                                LazyColumn(modifier = Modifier.width(tableWidth)) {
                                    item { HistoryTableHeaderRow() }
                                    items(
                                        visibleScans,
                                        key = { (_, scan) ->
                                            "scan-${scan.tileNumber}-${scan.weekNumber}-${scan.scanId}"
                                        }
                                    ) { (tile, scan) ->
                                        HistoryTableRow(
                                            tileLabel = "#$tile",
                                            plantName = plantNames[tile]?.ifBlank { null } ?: "Tile $tile",
                                            whenLabel = scan.formattedDate,
                                            result = diseaseDisplayLabel(scan.diseaseName),
                                            status = scan.historyStatus(),
                                            score = "${scan.percent}%",
                                            onView = { openScan = scan }
                                        )
                                    }
                                    if (showDeleted) {
                                        items(deletions, key = { "deleted-${it.id}" }) { entry ->
                                            HistoryTableRow(
                                                tileLabel = "#${entry.tileNumber}",
                                                plantName = entry.plantName,
                                                whenLabel = entry.deletedAtLabel,
                                                result = "Removed",
                                                status = HistoryStatus.Deleted,
                                                score = "—",
                                                onView = null
                                            )
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    openScan?.let { scan ->
        val latestId = tileScanHistory[scan.tileNumber]
            ?.maxByOrNull { it.scannedAtMillis }
            ?.scanId
        HistoryDetailDialog(
            scan = scan,
            plantName = plantNames[scan.tileNumber]?.ifBlank { null } ?: "Tile ${scan.tileNumber}",
            savedRecommendation = recommendations[scan.tileNumber]?.takeIf { latestId == scan.scanId },
            onDismiss = { openScan = null },
            onRecommendationSaved = { response ->
                onRecommendationSaved(scan, response)
            }
        )
    }
}

private enum class HistoryStatus(val label: String, val background: Color, val foreground: Color) {
    Healthy("Healthy", StatusOkBg, StatusOkFg),
    Issue("Issue", StatusIssueBg, StatusIssueFg),
    Saved("Saved", StatusSavedBg, StatusSavedFg),
    Deleted("Deleted", StatusDeletedBg, StatusDeletedFg)
}

private fun TileScanResult.historyStatus(): HistoryStatus = when {
    isHealthy && percent > 0 -> HistoryStatus.Healthy
    !isHealthy && percent > 0 -> HistoryStatus.Issue
    else -> HistoryStatus.Saved
}

@Composable
private fun HistorySummaryStatCard(label: String, value: Int) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(14.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        border = BorderStroke(1.dp, CardBorder),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
    ) {
        Column(modifier = Modifier.padding(horizontal = 18.dp, vertical = 16.dp)) {
            Text(text = label, fontSize = 13.sp, fontWeight = FontWeight.Medium, color = Muted)
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                text = value.toString(),
                fontSize = 24.sp,
                fontWeight = FontWeight.SemiBold,
                color = Ink,
                letterSpacing = (-0.3).sp
            )
        }
    }
}

private object HistoryTableColumns {
    val tile = 52.dp
    val plant = 128.dp
    val whenCol = 132.dp
    val result = 112.dp
    val status = 92.dp
    val score = 56.dp
    val action = 76.dp
    val total: Dp
        get() = tile + plant + whenCol + result + status + score + action + 24.dp
}

@Composable
private fun HistoryTableHeaderRow() {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(Color.White)
            .padding(horizontal = 12.dp, vertical = 10.dp)
    ) {
        HistoryHeaderCell("Tile", HistoryTableColumns.tile)
        HistoryHeaderCell("Plant", HistoryTableColumns.plant)
        HistoryHeaderCell("When", HistoryTableColumns.whenCol)
        HistoryHeaderCell("Result", HistoryTableColumns.result)
        HistoryHeaderCell("Status", HistoryTableColumns.status)
        HistoryHeaderCell("Score", HistoryTableColumns.score)
        HistoryHeaderCell("Action", HistoryTableColumns.action)
    }
}

@Composable
private fun HistoryHeaderCell(text: String, width: Dp) {
    Text(
        text = text.uppercase(),
        modifier = Modifier.width(width),
        fontSize = 11.sp,
        fontWeight = FontWeight.SemiBold,
        letterSpacing = 0.5.sp,
        color = Muted
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun HistoryMenu(
    label: String,
    expanded: Boolean,
    onExpand: () -> Unit,
    onDismiss: () -> Unit,
    content: @Composable () -> Unit
) {
    Box {
        Surface(
            onClick = onExpand,
            shape = RoundedCornerShape(8.dp),
            color = Color.White,
            border = BorderStroke(1.dp, CardBorderStrong),
            shadowElevation = 1.dp
        ) {
            Text(
                text = label,
                modifier = Modifier.padding(horizontal = 10.dp, vertical = 7.dp),
                fontSize = 13.sp,
                fontWeight = FontWeight.Normal,
                color = Ink,
                maxLines = 1
            )
        }
        DropdownMenu(expanded = expanded, onDismissRequest = onDismiss, content = { content() })
    }
}

@Composable
private fun HistoryTableRow(
    tileLabel: String,
    plantName: String,
    whenLabel: String,
    result: String,
    status: HistoryStatus,
    score: String,
    onView: (() -> Unit)?
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(Color.White)
            .padding(horizontal = 12.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        HistoryBodyCell(tileLabel, HistoryTableColumns.tile, FontWeight.Normal)
        HistoryBodyCell(plantName, HistoryTableColumns.plant, FontWeight.Medium)
        HistoryBodyCell(whenLabel, HistoryTableColumns.whenCol, FontWeight.Normal, Muted)
        HistoryBodyCell(result, HistoryTableColumns.result, FontWeight.Normal)
        Box(modifier = Modifier.width(HistoryTableColumns.status)) {
            HistoryStatusPill(status)
        }
        HistoryBodyCell(score, HistoryTableColumns.score, FontWeight.Normal)
        Box(
            modifier = Modifier.width(HistoryTableColumns.action),
            contentAlignment = Alignment.CenterStart
        ) {
            if (onView != null) {
                Surface(
                    onClick = onView,
                    shape = RoundedCornerShape(8.dp),
                    color = Color.White,
                    border = BorderStroke(1.dp, Color(0xFF14213D).copy(alpha = 0.14f))
                ) {
                    Text(
                        text = "View",
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
                        fontSize = 13.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = TomatoShell
                    )
                }
            }
        }
    }
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(1.dp)
            .background(RowDivider)
    )
}

@Composable
private fun HistoryBodyCell(
    text: String,
    width: Dp,
    weight: FontWeight,
    color: Color = Ink
) {
    Text(
        text = text,
        modifier = Modifier.width(width),
        fontSize = 14.sp,
        fontWeight = weight,
        color = color,
        maxLines = 1,
        overflow = TextOverflow.Ellipsis
    )
}

@Composable
private fun HistoryStatusPill(status: HistoryStatus) {
    Text(
        text = status.label,
        modifier = Modifier
            .clip(RoundedCornerShape(6.dp))
            .background(status.background)
            .padding(horizontal = 8.dp, vertical = 3.dp),
        color = status.foreground,
        fontSize = 12.sp,
        fontWeight = FontWeight.SemiBold,
        maxLines = 1
    )
}

@Composable
private fun HistoryDetailDialog(
    scan: TileScanResult,
    plantName: String,
    savedRecommendation: SavedRecommendation? = null,
    onDismiss: () -> Unit,
    onRecommendationSaved: (ValidationResponse) -> Unit = {}
) {
    var showCare by remember(scan.scanId) { mutableStateOf(false) }
    var showOfflineAlert by remember(scan.scanId) { mutableStateOf(false) }
    var awaitingRecommendation by remember(scan.scanId) { mutableStateOf(false) }
    var isLoadingRecommendation by remember(scan.scanId) { mutableStateOf(false) }
    var loadedRecommendation by remember(scan.scanId) { mutableStateOf<com.tomatoinsight.api.ValidationResponse?>(null) }
    val result = (loadedRecommendation ?: scan.response.takeIf { it.hasAiRecommendations }
        ?: scan.scores.asSavedValidationResponse()).ensureGuidesForAllDetections()
    val needsOnlineRecommendation = scan.response.stage == "offline" &&
        loadedRecommendation?.recommendationSource != "groq" &&
        savedRecommendation?.guides.isNullOrEmpty()
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val internetAvailable by produceState(initialValue = context.hasValidatedInternet(), context) {
        context.observeValidatedInternet().collect { value = it }
    }

    fun loadCareRecommendation() {
        val image = scan.image ?: return
        scope.launch {
            showCare = true
            isLoadingRecommendation = true
            awaitingRecommendation = false
            showOfflineAlert = false
            try {
                val server = withTimeout(300_000L) {
                    ImageUploadHelper.validateTomatoLeaf(context, image)
                }
                loadedRecommendation = scan.response.copy(
                    predictions = scan.response.predictions ?: scan.scores.asSavedValidationResponse().predictions,
                    aiRecommendations = server.aiRecommendations,
                    aiRecommendationError = server.aiRecommendationError,
                    aiDisclaimer = server.aiDisclaimer,
                    recommendationSource = server.recommendationSource,
                    groqModel = server.groqModel
                ).ensureGuidesForAllDetections()
                loadedRecommendation?.let(onRecommendationSaved)
                showCare = true
            } catch (_: Exception) {
                showCare = false
            } finally {
                isLoadingRecommendation = false
            }
        }
    }

    LaunchedEffect(awaitingRecommendation, internetAvailable) {
        if (awaitingRecommendation && internetAvailable && scan.image != null) {
            loadCareRecommendation()
        }
    }

    Dialog(onDismissRequest = onDismiss) {
        Surface(
            modifier = Modifier.fillMaxWidth().fillMaxHeight(0.88f),
            shape = RoundedCornerShape(20.dp),
            color = Color.White
        ) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .verticalScroll(rememberScrollState())
                    .padding(16.dp)
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text(text = plantName, fontWeight = FontWeight.Bold, fontSize = 20.sp, color = Ink)
                        Text(
                            text = "Tile ${scan.tileNumber} · Week ${scan.weekNumber ?: "—"} · ${scan.formattedDate}",
                            fontSize = 12.sp,
                            color = Muted
                        )
                    }
                    TextButton(onClick = onDismiss) { Text("Close") }
                }
                scan.image?.let { bitmap ->
                    Spacer(modifier = Modifier.height(12.dp))
                    androidx.compose.foundation.Image(
                        bitmap = bitmap.asImageBitmap(),
                        contentDescription = "Saved plant scan",
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(180.dp)
                            .clip(RoundedCornerShape(16.dp)),
                        contentScale = ContentScale.Crop
                    )
                }
                Spacer(modifier = Modifier.height(12.dp))
                Text(text = "Classification", fontWeight = FontWeight.Bold, color = Ink)
                Spacer(modifier = Modifier.height(8.dp))
                HealthStatusCard(result = result)
                if (result.allDiseaseScores.any { it.percent > 0 }) {
                    Spacer(modifier = Modifier.height(8.dp))
                    TextButton(
                        onClick = {
                            if (needsOnlineRecommendation && !internetAvailable) {
                                awaitingRecommendation = true
                                showOfflineAlert = true
                            } else if (needsOnlineRecommendation) {
                                loadCareRecommendation()
                            } else {
                                showCare = !showCare
                            }
                        },
                        enabled = !isLoadingRecommendation
                    ) {
                        Text(
                            when {
                                isLoadingRecommendation -> "Loading recommendation..."
                                showCare -> "Hide care recommendations"
                                else -> "View care recommendations"
                            }
                        )
                    }
                    AnimatedVisibility(
                        visible = showCare,
                        enter = fadeIn(tween(280, easing = FastOutSlowInEasing)) +
                            expandVertically(tween(320, easing = FastOutSlowInEasing)),
                        exit = fadeOut(tween(200, easing = FastOutSlowInEasing)) +
                            shrinkVertically(tween(280, easing = FastOutSlowInEasing))
                    ) {
                        if (isLoadingRecommendation) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(32.dp),
                                strokeWidth = 3.dp
                            )
                        } else {
                            DiseaseTreatmentCard(
                                result = result,
                                savedRecommendation = if (loadedRecommendation?.hasAiRecommendations == true) {
                                    null
                                } else {
                                    savedRecommendation
                                }
                            )
                        }
                    }
                }
            }
        }
    }
    if (showOfflineAlert) {
        AlertDialog(
            onDismissRequest = { showOfflineAlert = false },
            icon = {
                Icon(Icons.Default.Warning, contentDescription = null, tint = Color(0xFFD92D20))
            },
            title = { Text("Internet required", fontWeight = FontWeight.Bold) },
            text = {
                Text(
                    "Care recommendations need an internet connection. " +
                        "This recommendation will open automatically when the connection is back."
                )
            },
            confirmButton = {
                TextButton(onClick = { showOfflineAlert = false }) { Text("OK") }
            }
        )
    }
}
