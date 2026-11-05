package com.tomatoinsight.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.tomatoinsight.api.DISEASE_DISPLAY_ORDER
import com.tomatoinsight.api.DiseaseScore
import com.tomatoinsight.api.ValidationResponse
import com.tomatoinsight.api.diseaseAbbreviation
import com.tomatoinsight.api.diseaseDisplayLabel
import com.tomatoinsight.api.diseaseSeverityLabel
import com.tomatoinsight.api.isHealthyDisease

private val HealthHeaderGreen = Color(0xFF2E7D32)
private val SeverityBadgeGreen = Color(0xFFCDDC39)
private val DiseaseBadgeRed = Color(0xFFE57373)
private val ConfidenceOlive = Color(0xFF558B2F)
private val BarTrackGray = Color(0xFFE0E0E0)
private val BarTrackBlack = Color(0xFF212121)
private val HealthyBarGreen = Color(0xFF7CB342)
private val DiseaseBarRed = Color(0xFFE57373)
private val TopRankGold = Color(0xFFFFF176)

@Composable
fun HealthStatusCard(result: ValidationResponse? = null) {
    val scores = result?.allDiseaseScores ?: DISEASE_DISPLAY_ORDER.map { name ->
        DiseaseScore(
            name = name,
            abbreviation = diseaseAbbreviation(name),
            percent = 0
        )
    }
    val filled = result != null
    val leading = if (filled) scores.maxByOrNull { it.percent }?.takeIf { it.percent > 0 } else null

    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(20.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp)
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(
                    modifier = Modifier
                        .size(36.dp)
                        .background(TopRankGold, CircleShape),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        imageVector = Icons.Default.Warning,
                        contentDescription = null,
                        tint = Color.Black,
                        modifier = Modifier.size(20.dp)
                    )
                }
                Spacer(modifier = Modifier.width(10.dp))
                Text(
                    text = "HEALTH STATUS",
                    color = HealthHeaderGreen,
                    fontWeight = FontWeight.Bold,
                    fontSize = 18.sp
                )
            }

            Spacer(modifier = Modifier.height(14.dp))

            if (leading != null) {
                val severity = diseaseSeverityLabel(leading.name, leading.percent)
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        StatusBadge(
                            text = severity,
                            backgroundColor = if (isHealthyDisease(leading.name)) HealthyBarGreen else SeverityBadgeGreen,
                            textColor = Color.Black
                        )
                        StatusBadge(
                            text = diseaseDisplayLabel(leading.name),
                            backgroundColor = if (isHealthyDisease(leading.name)) HealthyBarGreen else DiseaseBadgeRed,
                            textColor = Color.White
                        )
                    }
                    Text(
                        text = "${leading.percent}% confidence",
                        color = ConfidenceOlive,
                        fontWeight = FontWeight.SemiBold,
                        fontSize = 14.sp
                    )
                }

                Spacer(modifier = Modifier.height(16.dp))
            }

            scores.forEachIndexed { index, score ->
                DiseaseProgressRow(
                    label = diseaseDisplayLabel(score.name),
                    percent = if (filled) score.percent else null,
                    barColor = if (isHealthyDisease(score.name)) HealthyBarGreen else DiseaseBarRed
                )
                if (index < scores.lastIndex) {
                    Spacer(modifier = Modifier.height(10.dp))
                }
            }
        }
    }
}

@Composable
private fun StatusBadge(
    text: String,
    backgroundColor: Color,
    textColor: Color
) {
    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(20.dp))
            .background(backgroundColor)
            .padding(horizontal = 14.dp, vertical = 6.dp)
    ) {
        Text(
            text = text,
            color = textColor,
            fontWeight = FontWeight.Bold,
            fontSize = 13.sp
        )
    }
}

@Composable
private fun DiseaseProgressRow(
    label: String,
    percent: Int?,
    barColor: Color
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(BarTrackGray)
            .padding(horizontal = 12.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            text = label,
            fontWeight = FontWeight.Bold,
            fontSize = 14.sp,
            color = Color.Black,
            maxLines = 1,
            modifier = Modifier.width(108.dp)
        )
        Box(
            modifier = Modifier
                .weight(1f)
                .height(24.dp)
                .clip(RoundedCornerShape(12.dp))
                .background(BarTrackBlack)
        ) {
            if (percent != null && percent > 0) {
                Box(
                    modifier = Modifier
                        .fillMaxHeight()
                        .fillMaxWidth(percent.coerceIn(0, 100) / 100f)
                        .clip(RoundedCornerShape(12.dp))
                        .background(barColor)
                )
            }
        }
        Spacer(modifier = Modifier.width(8.dp))
        Text(
            text = if (percent == null) "" else "$percent%",
            fontWeight = FontWeight.Bold,
            fontSize = 13.sp,
            color = Color.Black,
            modifier = Modifier.width(40.dp)
        )
    }
}
