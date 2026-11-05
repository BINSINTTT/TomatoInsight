package com.tomatoinsight.ui.camera

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.CompositingStrategy
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.tomatoinsight.ui.theme.TomatoGreen

@Composable
fun LeafFrameOverlay(
    modifier: Modifier = Modifier,
    instruction: String = "Place one tomato leaf inside the oval"
) {
    Box(modifier = modifier.fillMaxSize()) {
        Canvas(
            modifier = Modifier
                .fillMaxSize()
                .graphicsLayer { compositingStrategy = CompositingStrategy.Offscreen }
        ) {
            val bounds = TomatoLeafShape.guideBounds(size.width, size.height)

            drawRect(color = Color.Black.copy(alpha = 0.52f))
            drawOval(
                color = Color.Transparent,
                topLeft = bounds.topLeft,
                size = bounds.size,
                blendMode = BlendMode.Clear
            )

            drawOval(
                color = Color.White.copy(alpha = 0.95f),
                topLeft = bounds.topLeft,
                size = bounds.size,
                style = Stroke(width = LeafCameraGuide.STROKE_WIDTH_DP * density)
            )
            drawOval(
                color = TomatoGreen,
                topLeft = bounds.topLeft,
                size = bounds.size,
                style = Stroke(width = LeafCameraGuide.OUTER_STROKE_WIDTH_DP * density)
            )
        }

        Text(
            text = instruction,
            modifier = Modifier
                .align(Alignment.TopCenter)
                .padding(top = 48.dp, start = 24.dp, end = 24.dp),
            color = Color.White,
            fontSize = 16.sp,
            fontWeight = FontWeight.SemiBold,
            textAlign = TextAlign.Center
        )

        Text(
            text = "Fill the oval · Good lighting · One leaf only",
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .padding(bottom = 120.dp, start = 24.dp, end = 24.dp),
            color = Color.White.copy(alpha = 0.85f),
            fontSize = 13.sp,
            textAlign = TextAlign.Center
        )
    }
}
