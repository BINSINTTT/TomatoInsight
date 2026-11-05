package com.tomatoinsight.ui.camera

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.media.ExifInterface
import java.io.File

object CameraCaptureUtils {

    fun loadOrientedBitmap(file: File): Bitmap {
        val bitmap = BitmapFactory.decodeFile(file.absolutePath)
            ?: throw IllegalStateException("Could not decode captured image.")
        return applyExifRotation(file, bitmap)
    }

    fun cropToGuideFrame(source: Bitmap): Bitmap {
        val cropRect = TomatoLeafShape.cropRect(source.width, source.height)
        val width = cropRect.width().coerceAtLeast(1)
        val height = cropRect.height().coerceAtLeast(1)

        val cropped = Bitmap.createBitmap(source, cropRect.left, cropRect.top, width, height)
        if (cropped != source) {
            source.recycle()
        }

        return applyOvalMask(cropped)
    }

    private fun applyOvalMask(source: Bitmap): Bitmap {
        val output = Bitmap.createBitmap(
            source.width,
            source.height,
            Bitmap.Config.ARGB_8888
        )
        val canvas = Canvas(output)
        canvas.drawColor(android.graphics.Color.WHITE)

        val path = Path().apply {
            addOval(
                RectF(0f, 0f, source.width.toFloat(), source.height.toFloat()),
                Path.Direction.CW
            )
        }
        canvas.save()
        canvas.clipPath(path)
        canvas.drawBitmap(source, 0f, 0f, Paint(Paint.ANTI_ALIAS_FLAG))
        canvas.restore()

        source.recycle()
        return output
    }

    fun createCaptureFile(context: Context): File {
        val dir = File(context.cacheDir, "leaf_captures").apply { mkdirs() }
        return File(dir, "leaf_${System.currentTimeMillis()}.jpg")
    }

    private fun applyExifRotation(file: File, bitmap: Bitmap): Bitmap {
        val rotation = when (
            ExifInterface(file.absolutePath).getAttributeInt(
                ExifInterface.TAG_ORIENTATION,
                ExifInterface.ORIENTATION_NORMAL
            )
        ) {
            ExifInterface.ORIENTATION_ROTATE_90 -> 90
            ExifInterface.ORIENTATION_ROTATE_180 -> 180
            ExifInterface.ORIENTATION_ROTATE_270 -> 270
            else -> 0
        }

        if (rotation == 0) return bitmap

        val matrix = Matrix().apply { postRotate(rotation.toFloat()) }
        return Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, matrix, true)
    }
}
