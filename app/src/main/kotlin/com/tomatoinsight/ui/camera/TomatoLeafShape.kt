package com.tomatoinsight.ui.camera

import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.Size
import kotlin.math.min

/** Portrait oval scan guide — same bounds for overlay and crop. */
object TomatoLeafShape {

    fun guideBounds(canvasWidth: Float, canvasHeight: Float): Rect {
        var width = canvasWidth * LeafCameraGuide.WIDTH_FRACTION
        var height = width / LeafCameraGuide.ASPECT_RATIO
        val maxHeight = canvasHeight * LeafCameraGuide.MAX_HEIGHT_FRACTION
        if (height > maxHeight) {
            height = maxHeight
            width = height * LeafCameraGuide.ASPECT_RATIO
        }

        val left = (canvasWidth - width) / 2f
        val top = (canvasHeight - height) / 2f - canvasHeight * 0.03f
        return Rect(
            offset = Offset(left, top.coerceAtLeast(canvasHeight * 0.10f)),
            size = Size(width, height)
        )
    }

    fun cropRect(bitmapWidth: Int, bitmapHeight: Int): android.graphics.Rect {
        val bounds = guideBounds(bitmapWidth.toFloat(), bitmapHeight.toFloat())
        val left = bounds.left.toInt().coerceAtLeast(0)
        val top = bounds.top.toInt().coerceAtLeast(0)
        val right = min(bounds.right.toInt(), bitmapWidth)
        val bottom = min(bounds.bottom.toInt(), bitmapHeight)
        return android.graphics.Rect(left, top, right, bottom)
    }
}
