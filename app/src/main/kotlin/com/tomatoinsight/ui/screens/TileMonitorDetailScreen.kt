package com.tomatoinsight.ui.screens

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.tween
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.ExpandLess
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.tomatoinsight.api.DiseaseScore
import com.tomatoinsight.api.diseaseDisplayLabel
import com.tomatoinsight.api.inDiseaseDisplayOrder
import com.tomatoinsight.data.TileScanResult
import com.tomatoinsight.ui.components.DiseaseTreatmentCard
import com.tomatoinsight.ui.theme.TomatoGreen
import com.tomatoinsight.ui.theme.TomatoRed

private val HealthyGreen = Color(0xFF7CB342)
private val DiseaseRed = Color(0xFFE57373)
private val BarTrack = Color(0xFFE0E0E0)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TileMonitorDetailScreen(
    tileNumber: Int,
    scans: List<TileScanResult>,
    onNavigateBack: () -> Unit,
    onDeleteTileData: () -> Unit = {}
) {
    val latest = scans.firstOrNull()
    var showDeleteDialog by remember { mutableStateOf(false) }
    var expandedScanId by remember { mutableStateOf<Long?>(null) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = "Tile $tileNumber",
                        fontWeight = FontWeight.Bold,
                        fontSize = 18.sp
                    )
                },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Color.White)
            )
        }
    ) { padding ->
        if (scans.isEmpty()) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding)
                    .padding(24.dp),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = "No scans yet for this tile.\nScan from the dashboard to start tracking.",
                    fontSize = 14.sp,
                    color = Color.Gray,
                    textAlign = TextAlign.Center
                )
            }
            return@Scaffold
        }

        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .background(Color(0xFFFAFAFA))
                .padding(horizontal = 20.dp, vertical = 16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            item {
                latest?.let { CurrentStatusCard(scan = it) }
            }

            item {
                Text(
                    text = "SCAN HISTORY",
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Bold,
                    color = TomatoGreen,
                    modifier = Modifier.padding(top = 4.dp, bottom = 4.dp)
                )
                Text(
                    text = "${scans.size} scan${if (scans.size == 1) "" else "s"} recorded · tap to view intervention",
                    fontSize = 12.sp,
                    color = Color.Gray
                )
            }

            itemsIndexed(scans, key = { _, scan -> scan.scanId }) { index, scan ->
                ScanHistoryCard(
                    scan = scan,
                    isLatest = index == 0,
                    isExpanded = expandedScanId == scan.scanId,
                    onClick = {
                        expandedScanId = if (expandedScanId == scan.scanId) null else scan.scanId
                    }
                )
            }


        }

        if (showDeleteDialog) {
            AlertDialog(
                onDismissRequest = { showDeleteDialog = false },
                title = { Text("Delete Tile $tileNumber data?") },
                text = {
                    Text(
                        "This removes all saved scan results for this tile only. " +
                            "Other tiles are not affected."
                    )
                },
                confirmButton = {
                    TextButton(
                        onClick = {
                            showDeleteDialog = false
                            onDeleteTileData()
                        }
                    ) {
                        Text("Delete", color = TomatoRed)
                    }
                },
                dismissButton = {
                    TextButton(onClick = { showDeleteDialog = false }) {
                        Text("Cancel")
                    }
                }
            )
        }
    }
}

@Composable
private fun CurrentStatusCard(scan: TileScanResult) {
    val accent = if (scan.isHealthy) HealthyGreen else DiseaseRed
    val status = if (scan.isHealthy) "Healthy" else "Diseased"

    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(20.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Column(modifier = Modifier.padding(20.dp)) {
            Text(
                text = "CURRENT STATUS",
                fontSize = 11.sp,
                fontWeight = FontWeight.Bold,
                color = Color.Gray
            )
            Spacer(modifier = Modifier.height(8.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = scan.diseaseName,
                        fontSize = 22.sp,
                        fontWeight = FontWeight.Bold,
                        color = Color(0xFF212121)
                    )
                    Text(
                        text = scan.formattedDate,
                        fontSize = 12.sp,
                        color = Color.Gray
                    )
                }
                Column(horizontalAlignment = Alignment.End) {
                    Text(
                        text = "${scan.percent}%",
                        fontSize = 32.sp,
                        fontWeight = FontWeight.Bold,
                        color = accent
                    )
                    Surface(shape = RoundedCornerShape(20.dp), color = accent) {
                        Text(
                            text = status,
                            color = Color.White,
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp)
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(16.dp))

            scan.scores.inDiseaseDisplayOrder().forEach { score ->
                MiniScoreBar(score = score)
                Spacer(modifier = Modifier.height(6.dp))
            }
        }
    }
}

@Composable
private fun ScanHistoryCard(
    scan: TileScanResult,
    isLatest: Boolean,
    isExpanded: Boolean,
    onClick: () -> Unit
) {
    val accent = if (scan.isHealthy) HealthyGreen else DiseaseRed

    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
        shape = RoundedCornerShape(16.dp),
        color = if (isExpanded) Color(0xFFFFFDE7) else Color.White,
        shadowElevation = if (isExpanded) 2.dp else 1.dp
    ) {
        Column(modifier = Modifier.padding(14.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            text = scan.abbreviation,
                            fontSize = 15.sp,
                            fontWeight = FontWeight.Bold,
                            color = accent
                        )
                        if (isLatest) {
                            Spacer(modifier = Modifier.width(8.dp))
                            Surface(
                                shape = RoundedCornerShape(8.dp),
                                color = TomatoGreen.copy(alpha = 0.15f)
                            ) {
                                Text(
                                    text = "Latest",
                                    fontSize = 10.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = TomatoGreen,
                                    modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                                )
                            }
                        }
                    }
                    Text(
                        text = scan.diseaseName,
                        fontSize = 12.sp,
                        color = Color.Gray,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                    Text(
                        text = scan.formattedDate,
                        fontSize = 11.sp,
                        color = Color(0xFF9E9E9E)
                    )
                }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        text = "${scan.percent}%",
                        fontSize = 20.sp,
                        fontWeight = FontWeight.Bold,
                        color = Color(0xFF212121)
                    )
                    Icon(
                        imageVector = if (isExpanded) Icons.Default.ExpandLess else Icons.Default.ExpandMore,
                        contentDescription = if (isExpanded) "Collapse intervention" else "View intervention",
                        tint = Color(0xFF757575),
                        modifier = Modifier
                            .padding(start = 4.dp)
                            .size(24.dp)
                    )
                }
            }

            Spacer(modifier = Modifier.height(10.dp))

            scan.scores.inDiseaseDisplayOrder().forEach { score ->
                MiniScoreBar(score = score, compact = true)
                Spacer(modifier = Modifier.height(4.dp))
            }

            AnimatedVisibility(
                visible = isExpanded,
                enter = fadeIn(tween(280, easing = FastOutSlowInEasing)) +
                    expandVertically(tween(320, easing = FastOutSlowInEasing)),
                exit = fadeOut(tween(200, easing = FastOutSlowInEasing)) +
                    shrinkVertically(tween(280, easing = FastOutSlowInEasing))
            ) {
                Column {
                    Spacer(modifier = Modifier.height(12.dp))
                    DiseaseTreatmentCard(result = scan.response)
                }
            }
        }
    }
}

@Composable
private fun MiniScoreBar(
    score: DiseaseScore,
    compact: Boolean = false
) {
    val isHealthy = score.name.equals("Healthy", ignoreCase = true)
    val barColor = if (isHealthy) HealthyGreen else DiseaseRed
    val labelSize = if (compact) 10.sp else 11.sp
    val barHeight = if (compact) 6.dp else 8.dp

    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            text = diseaseDisplayLabel(score.name),
            fontSize = labelSize,
            fontWeight = FontWeight.Medium,
            color = Color(0xFF616161),
            modifier = Modifier.width(if (compact) 88.dp else 96.dp),
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
        )
        Box(
            modifier = Modifier
                .weight(1f)
                .height(barHeight)
                .clip(RoundedCornerShape(4.dp))
                .background(BarTrack)
        ) {
            if (score.percent > 0) {
                Box(
                    modifier = Modifier
                        .fillMaxHeight()
                        .fillMaxWidth(score.percent.coerceIn(1, 100) / 100f)
                        .clip(RoundedCornerShape(4.dp))
                        .background(barColor)
                )
            }
        }
        Spacer(modifier = Modifier.width(6.dp))
        Text(
            text = "${score.percent}%",
            fontSize = labelSize,
            fontWeight = FontWeight.Bold,
            color = Color(0xFF424242),
            modifier = Modifier.width(32.dp),
            textAlign = TextAlign.End
        )
    }
}
