package com.tomatoinsight.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowDropDown
import androidx.compose.material.icons.filled.ChatBubbleOutline
import androidx.compose.material.icons.filled.GridView
import androidx.compose.material.icons.filled.Place
import androidx.compose.material.icons.filled.ShowChart
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.tomatoinsight.data.BAR_EARLY_BLIGHT
import com.tomatoinsight.data.BAR_HEALTHY
import com.tomatoinsight.data.BAR_SPOTTED_WILT
import com.tomatoinsight.data.BAR_TLCV
import com.tomatoinsight.data.FarmWeekScan
import com.tomatoinsight.data.MONITORING_BAR_KEYS
import com.tomatoinsight.data.MonitoringTile
import com.tomatoinsight.data.TileScanHistory
import com.tomatoinsight.data.WeekComparison
import com.tomatoinsight.data.compareSavedWeeks
import com.tomatoinsight.data.monitoringResultLabel
import com.tomatoinsight.data.previousSavedWeek
import com.tomatoinsight.data.toMonitoringTiles
import com.tomatoinsight.ui.components.ConnectionStatusIndicator
import com.tomatoinsight.ui.components.CustomBottomBar
import com.tomatoinsight.ui.components.InternetConnectionNotice

/** Matches website monitoring.css palette. */
private val PageBackground = Color(0xFFF8FAFC)
private val CardBorder = Color(0x140F172A)
private val Ink = Color(0xFF0F172A)
private val Muted = Color(0xFF64748B)
private val IconMuted = Color(0xFF94A3B8)
private val ImprovedGreen = Color(0xFF1B5E20)
private val WorseRed = Color(0xFFC62828)
private val PhotoFrameBg = Color(0xFFF7FBF6)
private val PhotoFrameBorder = Color(0x7343A047)
private val WeekRowBg = Color(0x0F1E293B)
private val RowChipBg = Color(0xFFECECEB)
private val TrackBg = Color(0xFFD4D4D3)
private val HealthyStart = Color(0xFF43A047)
private val HealthyEnd = Color(0xFF2E7D32)
private val TlcvStart = Color(0xFFFB8C00)
private val TlcvEnd = Color(0xFFEF6C00)
private val BlightStart = Color(0xFFE53935)
private val BlightEnd = Color(0xFFB71C1C)
private val WiltStart = Color(0xFF8E24AA)
private val WiltEnd = Color(0xFF6A1B9A)

private val ChartMaxHeight = 148.dp
private val ChartMinHeight = 4.dp
private val NoPlantNames = emptyMap<Int, String>()

@Composable
fun MonitoringScreen(
    onNavigateToHome: () -> Unit,
    onNavigateToHistory: () -> Unit,
    onNavigateToProfile: () -> Unit,
    onCameraClick: () -> Unit,
    tileScanHistory: TileScanHistory,
    plantNames: Map<Int, String> = NoPlantNames,
    selectedTile: Int?,
    selectedWeek: Int?,
    onSelectedTileChange: (Int?) -> Unit,
    onSelectedWeekChange: (Int?) -> Unit
) {
    val tiles = tileScanHistory.toMonitoringTiles(plantNames)
    val activeTile = tiles.firstOrNull { it.tileNumber == selectedTile }
    val chosen = activeTile?.weeks?.firstOrNull { it.weekNumber == selectedWeek }
    val past = if (activeTile != null && chosen != null) {
        previousSavedWeek(activeTile.weeks, chosen)
    } else {
        null
    }
    val comparison = compareSavedWeeks(past, chosen)
    val savedWeekNumbers = activeTile?.weeks?.map { it.weekNumber }.orEmpty()

    LaunchedEffect(selectedTile, selectedWeek, savedWeekNumbers) {
        if (selectedTile != null && activeTile == null) {
            onSelectedTileChange(null)
            onSelectedWeekChange(null)
            return@LaunchedEffect
        }
        if (activeTile != null && activeTile.weeks.none { it.weekNumber == selectedWeek }) {
            onSelectedWeekChange(activeTile.weeks.lastOrNull()?.weekNumber)
        }
    }

    Scaffold(
        containerColor = PageBackground,
        bottomBar = {
            CustomBottomBar(
                selectedTab = "monitoring",
                cameraEnabled = false,
                onHomeClick = onNavigateToHome,
                onMonitoringClick = { },
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
                .background(PageBackground)
                .verticalScroll(rememberScrollState())
        ) {
            InternetConnectionNotice(
                modifier = Modifier.padding(horizontal = 20.dp).padding(top = 8.dp)
            )
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 20.dp)
                    .padding(top = 8.dp, bottom = 4.dp),
                horizontalArrangement = Arrangement.End,
                verticalAlignment = Alignment.CenterVertically
            ) {
                ConnectionStatusIndicator()
            }

            Column(
                modifier = Modifier.padding(horizontal = 16.dp).padding(bottom = 24.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                OverviewTabChip()

                // Website mobile breakpoint stacks stats; 2×2 still reads like the board.
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    StatCard(
                        modifier = Modifier.weight(1f),
                        title = "Tile",
                        icon = Icons.Filled.GridView,
                        hint = tileHint(activeTile, past, chosen)
                    ) {
                        TilePicker(
                            tiles = tiles,
                            selected = activeTile,
                            onTilePicked = { tile ->
                                onSelectedTileChange(tile.tileNumber)
                                onSelectedWeekChange(tile.weeks.lastOrNull()?.weekNumber)
                            }
                        )
                    }
                    StatCard(
                        modifier = Modifier.weight(1f),
                        title = if (past != null) "Week ${past.weekNumber}" else "Past week",
                        icon = Icons.Filled.Place,
                        value = monitoringResultLabel(past?.topBarKey) ?: "—",
                        valueColor = if (past == null) Muted else Ink,
                        hint = pastWeekHint(past, chosen)
                    )
                }
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    StatCard(
                        modifier = Modifier.weight(1f),
                        title = if (chosen != null) "Week ${chosen.weekNumber}" else "Chosen week",
                        icon = Icons.Filled.ChatBubbleOutline,
                        value = monitoringResultLabel(chosen?.topBarKey) ?: "—",
                        valueColor = if (chosen == null) Muted else Ink,
                        hint = chosenWeekHint(past, chosen)
                    )
                    StatCard(
                        modifier = Modifier.weight(1f),
                        title = "Change",
                        icon = Icons.Filled.ShowChart,
                        value = comparisonText(comparison),
                        valueColor = comparisonColor(comparison),
                        hint = changeHint(past, chosen)
                    )
                }

                OverviewChartCard(past = past, chosen = chosen)
                WeeksCard(
                    tileSelected = activeTile != null,
                    weeks = activeTile?.weeks.orEmpty(),
                    selectedWeek = chosen?.weekNumber,
                    onWeekSelected = onSelectedWeekChange
                )
                if (chosen != null) {
                    if (past != null) {
                        WeekScanCard(scan = past)
                    }
                    WeekScanCard(scan = chosen)
                }
            }
        }
    }
}

@Composable
private fun OverviewTabChip() {
    Surface(
        shape = RoundedCornerShape(14.dp),
        color = Color(0x0D0F172A)
    ) {
        Text(
            text = "Overview",
            color = Ink,
            fontSize = 13.sp,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier
                .padding(4.dp)
                .background(Color.White, RoundedCornerShape(10.dp))
                .padding(horizontal = 14.dp, vertical = 8.dp)
        )
    }
}

@Composable
private fun StatCard(
    modifier: Modifier = Modifier,
    title: String,
    icon: ImageVector,
    value: String? = null,
    valueColor: Color = Ink,
    hint: String = "",
    content: (@Composable ColumnScope.() -> Unit)? = null
) {
    Card(
        modifier = modifier,
        shape = RoundedCornerShape(14.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        border = BorderStroke(1.dp, CardBorder),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp)
    ) {
        Column(modifier = Modifier.padding(horizontal = 14.dp, vertical = 12.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(text = title, fontSize = 12.sp, color = Muted, fontWeight = FontWeight.Medium)
                Icon(
                    imageVector = icon,
                    contentDescription = null,
                    tint = IconMuted,
                    modifier = Modifier.size(16.dp)
                )
            }
            Spacer(modifier = Modifier.height(8.dp))
            if (content != null) {
                content()
            } else if (value != null) {
                Text(
                    text = value,
                    fontSize = 20.sp,
                    fontWeight = FontWeight.Bold,
                    color = valueColor,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                    lineHeight = 24.sp
                )
            }
            if (hint.isNotBlank()) {
                Spacer(modifier = Modifier.height(6.dp))
                Text(
                    text = hint,
                    fontSize = 11.sp,
                    color = Muted,
                    lineHeight = 14.sp,
                    maxLines = 3,
                    overflow = TextOverflow.Ellipsis
                )
            }
        }
    }
}

@Composable
private fun TilePicker(
    tiles: List<MonitoringTile>,
    selected: MonitoringTile?,
    onTilePicked: (MonitoringTile) -> Unit
) {
    var expanded by remember { mutableStateOf(false) }
    val enabled = tiles.isNotEmpty()

    Box(modifier = Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clickable(enabled = enabled) { expanded = true },
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = selected?.plantName ?: "Choose a tile",
                modifier = Modifier.weight(1f),
                color = if (!enabled || selected == null) Muted else Ink,
                fontSize = 16.sp,
                fontWeight = FontWeight.Bold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
            Icon(
                imageVector = Icons.Filled.ArrowDropDown,
                contentDescription = null,
                tint = if (enabled) Ink else Muted
            )
        }
        DropdownMenu(
            expanded = expanded && enabled,
            onDismissRequest = { expanded = false }
        ) {
            tiles.forEach { tile ->
                DropdownMenuItem(
                    text = {
                        Text(
                            text = tile.plantName,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                    },
                    onClick = {
                        expanded = false
                        onTilePicked(tile)
                    }
                )
            }
        }
    }
}

@Composable
private fun OverviewChartCard(
    past: FarmWeekScan?,
    chosen: FarmWeekScan?
) {
    MonitoringPanel(
        title = "Overview",
        caption = if (chosen == null) {
            "Compared scores for the selected tile."
        } else if (past != null) {
            "Week ${past.weekNumber} compared with Week ${chosen.weekNumber}."
        } else {
            "Week ${chosen.weekNumber} is the first scan. Choose a later week to compare."
        }
    ) {
        if (chosen == null) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(160.dp),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = "Choose a week to compare it with the scan before it.",
                    fontSize = 13.sp,
                    color = Muted,
                    textAlign = TextAlign.Center
                )
            }
        } else {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(12.dp))
                    .background(
                        Brush.verticalGradient(
                            listOf(Color(0xFFF8FAFC), Color.White, Color(0xFFF1F5F9))
                        )
                    )
                    .border(1.dp, Color(0x0F0F172A), RoundedCornerShape(12.dp))
                    .padding(horizontal = 8.dp, vertical = 10.dp)
            ) {
                Row(modifier = Modifier.fillMaxWidth()) {
                    Column(
                        modifier = Modifier
                            .width(28.dp)
                            .height(ChartMaxHeight + 28.dp),
                        verticalArrangement = Arrangement.SpaceBetween,
                        horizontalAlignment = Alignment.End
                    ) {
                        listOf("100", "75", "50", "25", "0").forEach { tick ->
                            Text(text = tick, fontSize = 9.sp, color = IconMuted, fontWeight = FontWeight.SemiBold)
                        }
                    }
                    Spacer(modifier = Modifier.width(6.dp))
                    Row(
                        modifier = Modifier
                            .weight(1f)
                            .height(ChartMaxHeight + 28.dp),
                        horizontalArrangement = Arrangement.SpaceEvenly,
                        verticalAlignment = Alignment.Bottom
                    ) {
                        MONITORING_BAR_KEYS.forEach { key ->
                            Column(
                                modifier = Modifier.weight(1f),
                                horizontalAlignment = Alignment.CenterHorizontally,
                                verticalArrangement = Arrangement.Bottom
                            ) {
                                Row(
                                    modifier = Modifier.height(ChartMaxHeight),
                                    verticalAlignment = Alignment.Bottom,
                                    horizontalArrangement = Arrangement.spacedBy(5.dp)
                                ) {
                                    if (past != null) {
                                        DiseaseScoreBar(
                                            percent = past.scores[key] ?: 0,
                                            brush = chartBrush(key),
                                            past = true
                                        )
                                    }
                                    DiseaseScoreBar(
                                        percent = chosen.scores[key] ?: 0,
                                        brush = chartBrush(key),
                                        past = false
                                    )
                                }
                                Spacer(modifier = Modifier.height(8.dp))
                                Text(
                                    text = chartLabel(key),
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = classificationEnd(key),
                                    maxLines = 1
                                )
                            }
                        }
                    }
                }
            }
            Spacer(modifier = Modifier.height(12.dp))
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 4.dp),
                horizontalArrangement = Arrangement.spacedBy(18.dp)
            ) {
                if (past != null) {
                    LegendSwatch(
                        label = "Week ${past.weekNumber}",
                        brush = Brush.horizontalGradient(listOf(Color(0xFF94A3B8), Color(0xFF64748B)))
                    )
                }
                LegendSwatch(
                    label = "Week ${chosen.weekNumber}",
                    brush = Brush.horizontalGradient(
                        listOf(BlightStart, HealthyStart, WiltStart)
                    )
                )
            }
        }
    }
}

@Composable
private fun DiseaseScoreBar(
    percent: Int,
    brush: Brush,
    past: Boolean
) {
    val fraction = percent.coerceIn(0, 100) / 100f
    val scaled = ChartMaxHeight * fraction
    val height = when {
        percent <= 0 -> 0.dp
        scaled < ChartMinHeight -> ChartMinHeight
        else -> scaled
    }
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        if (percent > 0) {
            Text(
                text = "$percent%",
                fontSize = 9.sp,
                fontWeight = FontWeight.Bold,
                color = Color.White,
                modifier = Modifier
                    .clip(RoundedCornerShape(4.dp))
                    .background(Color(0xE00F172A))
                    .padding(horizontal = 4.dp, vertical = 1.dp)
            )
            Spacer(modifier = Modifier.height(4.dp))
        } else {
            Spacer(modifier = Modifier.height(16.dp))
        }
        Box {
            Box(
                modifier = Modifier
                    .width(14.dp)
                    .height(height)
                    .clip(RoundedCornerShape(topStart = 7.dp, topEnd = 7.dp, bottomStart = 3.dp, bottomEnd = 3.dp))
                    .background(brush)
            )
            if (past && height > 0.dp) {
                Box(
                    modifier = Modifier
                        .width(14.dp)
                        .height(height)
                        .clip(RoundedCornerShape(topStart = 7.dp, topEnd = 7.dp, bottomStart = 3.dp, bottomEnd = 3.dp))
                        .background(Color.White.copy(alpha = 0.48f))
                )
            }
        }
    }
}

@Composable
private fun LegendSwatch(label: String, brush: Brush) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Box(
            modifier = Modifier
                .width(22.dp)
                .height(7.dp)
                .clip(RoundedCornerShape(99.dp))
                .background(brush)
        )
        Spacer(modifier = Modifier.width(6.dp))
        Text(text = label, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = Muted)
    }
}

@Composable
private fun WeeksCard(
    tileSelected: Boolean,
    weeks: List<FarmWeekScan>,
    selectedWeek: Int?,
    onWeekSelected: (Int) -> Unit
) {
    MonitoringPanel(
        title = "Weeks",
        caption = "Choose a week to compare it with the scan before it."
    ) {
        when {
            !tileSelected -> {
                Text(text = "Select a tile to see its scans.", fontSize = 13.sp, color = Muted)
            }
            weeks.isEmpty() -> {
                Text(
                    text = "No scan saved for this tile yet. Scan it on Home and tap Save Info.",
                    fontSize = 13.sp,
                    color = Muted
                )
            }
            else -> {
                Column {
                    weeks.forEachIndexed { index, week ->
                        val note = if (index == 0) {
                            "First scan"
                        } else {
                            "Compare with Week ${weeks[index - 1].weekNumber}"
                        }
                        WeekRow(
                            week = week,
                            note = note,
                            selected = week.weekNumber == selectedWeek,
                            onClick = { onWeekSelected(week.weekNumber) }
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun WeekRow(
    week: FarmWeekScan,
    note: String,
    selected: Boolean,
    onClick: () -> Unit
) {
    val result = monitoringResultLabel(week.topBarKey) ?: "—"
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(10.dp))
            .background(if (selected) WeekRowBg else Color.Transparent)
            .clickable(onClick = onClick)
            .padding(horizontal = 6.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(
            modifier = Modifier
                .size(32.dp)
                .clip(CircleShape)
                .background(Color(0xFFF1F5F9)),
            contentAlignment = Alignment.Center
        ) {
            Text(
                text = "W${week.weekNumber}",
                color = Color(0xFF334155),
                fontSize = 11.sp,
                fontWeight = FontWeight.Bold
            )
        }
        Spacer(modifier = Modifier.width(12.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = "Week ${week.weekNumber}",
                fontSize = 14.sp,
                fontWeight = FontWeight.SemiBold,
                color = Ink
            )
            Text(
                text = "$result · $note",
                fontSize = 12.sp,
                color = Muted,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
        }
        Text(
            text = "${week.topPct}%",
            fontSize = 14.sp,
            fontWeight = FontWeight.Bold,
            color = Ink
        )
    }
}

@Composable
private fun WeekScanCard(scan: FarmWeekScan) {
    val result = monitoringResultLabel(scan.topBarKey)
    val photo = remember(scan.image) { scan.image?.asImageBitmap() }
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(14.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        border = BorderStroke(1.dp, CardBorder),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(
                text = "Week ${scan.weekNumber}",
                fontSize = 15.sp,
                fontWeight = FontWeight.Bold,
                color = Ink
            )
            Text(
                text = if (result != null) {
                    "$result · ${scan.topPct}% · ${scan.savedAtLabel}"
                } else {
                    "No classification saved"
                },
                fontSize = 12.sp,
                color = Muted,
                modifier = Modifier.padding(top = 2.dp, bottom = 12.dp)
            )
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(200.dp)
                    .clip(RoundedCornerShape(16.dp))
                    .background(PhotoFrameBg)
                    .border(2.dp, PhotoFrameBorder, RoundedCornerShape(16.dp)),
                contentAlignment = Alignment.Center
            ) {
                if (photo != null) {
                    Image(
                        bitmap = photo,
                        contentDescription = "Leaf photo for week ${scan.weekNumber}",
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(12.dp)
                            .clip(RoundedCornerShape(8.dp)),
                        contentScale = ContentScale.Fit
                    )
                } else {
                    Text(text = "No photo saved for this week.", fontSize = 13.sp, color = Muted)
                }
            }
            Spacer(modifier = Modifier.height(14.dp))
            Text(
                text = "CLASSIFICATION",
                fontSize = 11.sp,
                fontWeight = FontWeight.Bold,
                letterSpacing = 0.8.sp,
                color = Muted
            )
            Spacer(modifier = Modifier.height(8.dp))
            MONITORING_BAR_KEYS.forEach { key ->
                ClassificationRow(
                    label = classificationFullLabel(key),
                    percent = scan.scores[key] ?: 0,
                    brush = fillBrush(key)
                )
                Spacer(modifier = Modifier.height(8.dp))
            }
        }
    }
}

@Composable
private fun ClassificationRow(
    label: String,
    percent: Int,
    brush: Brush
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(RowChipBg)
            .padding(horizontal = 10.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            text = label,
            modifier = Modifier.width(92.dp),
            fontSize = 13.sp,
            fontWeight = FontWeight.Bold,
            color = Ink,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
        )
        Box(
            modifier = Modifier
                .weight(1f)
                .height(18.dp)
                .clip(RoundedCornerShape(99.dp))
                .background(TrackBg)
        ) {
            Box(
                modifier = Modifier
                    .fillMaxHeight()
                    .fillMaxWidth(percent.coerceIn(0, 100) / 100f)
                    .background(brush, RoundedCornerShape(99.dp))
            )
        }
        Text(
            text = "$percent%",
            modifier = Modifier
                .width(42.dp)
                .padding(start = 8.dp),
            fontSize = 12.sp,
            fontWeight = FontWeight.Bold,
            color = Muted,
            textAlign = TextAlign.End
        )
    }
}

@Composable
private fun MonitoringPanel(
    title: String,
    caption: String,
    content: @Composable ColumnScope.() -> Unit
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(14.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        border = BorderStroke(1.dp, CardBorder),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(text = title, fontSize = 15.sp, fontWeight = FontWeight.Bold, color = Ink)
            Text(
                text = caption,
                fontSize = 12.sp,
                color = Muted,
                modifier = Modifier.padding(top = 2.dp, bottom = 12.dp)
            )
            content()
        }
    }
}

private fun tileHint(
    tile: MonitoringTile?,
    past: FarmWeekScan?,
    chosen: FarmWeekScan?
): String {
    if (tile == null || chosen == null) return "Select a tile to see its scans."
    if (past == null) return "Week ${chosen.weekNumber} is the first scan."
    return "Week ${past.weekNumber} compared with Week ${chosen.weekNumber}."
}

private fun pastWeekHint(past: FarmWeekScan?, chosen: FarmWeekScan?): String = when {
    past != null -> "${past.topPct}% · previous scan"
    chosen != null -> "No earlier scan"
    else -> "Previous scan"
}

private fun chosenWeekHint(past: FarmWeekScan?, chosen: FarmWeekScan?): String = when {
    chosen == null -> ""
    past == null -> "${chosen.topPct}% · first scan"
    else -> "${chosen.topPct}% · chosen week"
}

private fun changeHint(past: FarmWeekScan?, chosen: FarmWeekScan?): String = when {
    chosen == null -> "Select a tile to compare scans"
    past == null -> "This is the first scan"
    else -> "Week ${past.weekNumber} vs Week ${chosen.weekNumber}"
}

private fun comparisonText(comparison: WeekComparison): String = when (comparison) {
    WeekComparison.Improved -> "Improved"
    WeekComparison.Worse -> "Worse"
    WeekComparison.Same -> "Same"
    WeekComparison.Changed -> "Changed"
    WeekComparison.FirstScan -> "First scan"
    WeekComparison.None -> "—"
}

private fun comparisonColor(comparison: WeekComparison): Color = when (comparison) {
    WeekComparison.Improved -> ImprovedGreen
    WeekComparison.Worse -> WorseRed
    WeekComparison.None -> Muted
    else -> Ink
}

private fun chartLabel(key: String): String = when (key) {
    BAR_HEALTHY -> "Healthy"
    BAR_TLCV -> "TLCV"
    BAR_EARLY_BLIGHT -> "Blight"
    BAR_SPOTTED_WILT -> "Wilt"
    else -> key
}

private fun classificationFullLabel(key: String): String = when (key) {
    BAR_HEALTHY -> "Healthy"
    BAR_TLCV -> "TLCV"
    BAR_EARLY_BLIGHT -> "Early Blight"
    BAR_SPOTTED_WILT -> "Spotted Wilt"
    else -> key
}

private fun chartBrush(key: String): Brush = when (key) {
    BAR_HEALTHY -> Brush.verticalGradient(listOf(HealthyStart, HealthyEnd))
    BAR_TLCV -> Brush.verticalGradient(listOf(TlcvStart, TlcvEnd))
    BAR_EARLY_BLIGHT -> Brush.verticalGradient(listOf(BlightStart, BlightEnd))
    BAR_SPOTTED_WILT -> Brush.verticalGradient(listOf(WiltStart, WiltEnd))
    else -> Brush.verticalGradient(listOf(Muted, Muted))
}

private fun fillBrush(key: String): Brush = when (key) {
    BAR_HEALTHY -> Brush.horizontalGradient(listOf(HealthyStart, HealthyEnd))
    BAR_TLCV -> Brush.horizontalGradient(listOf(TlcvStart, TlcvEnd))
    BAR_EARLY_BLIGHT -> Brush.horizontalGradient(listOf(BlightStart, BlightEnd))
    BAR_SPOTTED_WILT -> Brush.horizontalGradient(listOf(WiltStart, WiltEnd))
    else -> Brush.horizontalGradient(listOf(Muted, Muted))
}

private fun classificationEnd(key: String): Color = when (key) {
    BAR_HEALTHY -> HealthyEnd
    BAR_TLCV -> TlcvEnd
    BAR_EARLY_BLIGHT -> BlightEnd
    BAR_SPOTTED_WILT -> WiltEnd
    else -> Muted
}
