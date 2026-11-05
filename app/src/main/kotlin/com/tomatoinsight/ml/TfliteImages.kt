package com.tomatoinsight.ml

import android.graphics.Bitmap
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.min
import kotlin.math.roundToInt

/** RGB 0–1, channels-first input used by both Ultralytics classifiers. */
internal fun bitmapToNchw(bitmap: Bitmap, size: Int): ByteBuffer {
    val cropped = centerCrop(bitmap, size)
    val pixels = IntArray(size * size)
    cropped.getPixels(pixels, 0, size, 0, 0, size, size)
    if (cropped !== bitmap) cropped.recycle()

    val buffer = ByteBuffer.allocateDirect(1 * 3 * size * size * 4)
    buffer.order(ByteOrder.nativeOrder())
    for (channel in 0 until 3) {
        val shift = when (channel) {
            0 -> 16
            1 -> 8
            else -> 0
        }
        for (pixel in pixels) {
            val value = (pixel shr shift) and 0xFF
            buffer.putFloat(value / 255f)
        }
    }
    buffer.rewind()
    return buffer
}

private fun centerCrop(source: Bitmap, size: Int): Bitmap {
    val argb = if (source.config == Bitmap.Config.ARGB_8888) {
        source
    } else {
        source.copy(Bitmap.Config.ARGB_8888, false)
    }
    val scale = size.toFloat() / min(argb.width, argb.height).coerceAtLeast(1)
    val scaledWidth = (argb.width * scale).roundToInt().coerceAtLeast(size)
    val scaledHeight = (argb.height * scale).roundToInt().coerceAtLeast(size)
    val scaled = if (scaledWidth == argb.width && scaledHeight == argb.height) {
        argb
    } else {
        Bitmap.createScaledBitmap(argb, scaledWidth, scaledHeight, true)
    }
    val x = ((scaled.width - size) / 2).coerceAtLeast(0)
    val y = ((scaled.height - size) / 2).coerceAtLeast(0)
    val cropWidth = min(size, scaled.width)
    val cropHeight = min(size, scaled.height)
    val cropped = if (x == 0 && y == 0 && cropWidth == scaled.width && cropHeight == scaled.height) {
        scaled
    } else {
        Bitmap.createBitmap(scaled, x, y, cropWidth, cropHeight)
    }
    if (scaled !== argb && scaled !== cropped) scaled.recycle()
    if (argb !== source && argb !== cropped) argb.recycle()
    return cropped
}
