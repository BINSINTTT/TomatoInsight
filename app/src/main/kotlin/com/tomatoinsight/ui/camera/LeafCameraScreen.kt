package com.tomatoinsight.ui.camera

import android.Manifest
import android.content.pm.PackageManager
import android.util.Log
import android.view.ViewGroup
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageCapture
import androidx.camera.core.ImageCaptureException
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.CameraAlt
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import com.tomatoinsight.ui.theme.TomatoGreen
import java.util.concurrent.Executor

private const val TAG = "LeafCamera"

@Composable
fun LeafCameraScreen(
    onImageCaptured: (android.graphics.Bitmap) -> Unit,
    onClose: () -> Unit
) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val mainExecutor = remember(context) { ContextCompat.getMainExecutor(context) }

    var hasCameraPermission by remember {
        mutableStateOf(
            ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) ==
                PackageManager.PERMISSION_GRANTED
        )
    }
    var imageCapture by remember { mutableStateOf<ImageCapture?>(null) }
    var isCapturing by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var cameraBound by remember { mutableStateOf(false) }

    val permissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission()
    ) { granted ->
        hasCameraPermission = granted
        if (!granted) {
            errorMessage = "Camera permission is required to scan a leaf."
        }
    }

    DisposableEffect(Unit) {
        onDispose {
            imageCapture = null
            cameraBound = false
        }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black)
    ) {
        when {
            !hasCameraPermission -> {
                Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = errorMessage ?: "Allow camera access to continue.",
                        color = Color.White,
                        modifier = Modifier.padding(24.dp)
                    )
                }
            }

            else -> {
                AndroidView(
                    modifier = Modifier.fillMaxSize(),
                    factory = { ctx ->
                        PreviewView(ctx).apply {
                            layoutParams = ViewGroup.LayoutParams(
                                ViewGroup.LayoutParams.MATCH_PARENT,
                                ViewGroup.LayoutParams.MATCH_PARENT
                            )
                            scaleType = PreviewView.ScaleType.FILL_CENTER
                        }
                    },
                    update = { view ->
                        if (cameraBound) return@AndroidView

                        val previewView = view as PreviewView
                        val cameraProviderFuture = ProcessCameraProvider.getInstance(context)
                        cameraProviderFuture.addListener({
                            try {
                                val cameraProvider = cameraProviderFuture.get()
                                cameraProvider.unbindAll()

                                val preview = Preview.Builder().build()
                                preview.setSurfaceProvider(previewView.getSurfaceProvider())

                                val capture = ImageCapture.Builder()
                                    .setCaptureMode(ImageCapture.CAPTURE_MODE_MAXIMIZE_QUALITY)
                                    .build()

                                imageCapture = capture

                                cameraProvider.bindToLifecycle(
                                    lifecycleOwner,
                                    CameraSelector.DEFAULT_BACK_CAMERA,
                                    preview,
                                    capture
                                )
                                cameraBound = true
                            } catch (e: Exception) {
                                Log.e(TAG, "Camera bind failed", e)
                                errorMessage = "Could not start camera: ${e.message}"
                            }
                        }, mainExecutor)
                    }
                )

                LeafFrameOverlay()
            }
        }

        IconButton(
            onClick = onClose,
            modifier = Modifier
                .align(Alignment.TopStart)
                .padding(8.dp)
        ) {
            Icon(
                Icons.AutoMirrored.Filled.ArrowBack,
                contentDescription = "Close camera",
                tint = Color.White
            )
        }

        if (hasCameraPermission) {
            Box(
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .padding(bottom = 36.dp)
            ) {
                if (isCapturing) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(72.dp),
                        color = Color.White
                    )
                } else {
                    IconButton(
                        onClick = {
                            val capture = imageCapture ?: return@IconButton
                            if (isCapturing) return@IconButton
                            isCapturing = true
                            errorMessage = null
                            takePhoto(
                                context = context,
                                imageCapture = capture,
                                executor = mainExecutor,
                                onSuccess = { bitmap ->
                                    isCapturing = false
                                    onImageCaptured(bitmap)
                                },
                                onError = { message ->
                                    isCapturing = false
                                    errorMessage = message
                                }
                            )
                        },
                        modifier = Modifier
                            .size(72.dp)
                            .border(3.dp, Color.White, CircleShape)
                            .background(TomatoGreen.copy(alpha = 0.35f), CircleShape)
                    ) {
                        Icon(
                            Icons.Default.CameraAlt,
                            contentDescription = "Capture Tomato leaf photo",
                            tint = Color.White,
                            modifier = Modifier.size(32.dp)
                        )
                    }
                }
            }
        }

        if (!hasCameraPermission && errorMessage == null) {
            androidx.compose.runtime.LaunchedEffect(Unit) {
                permissionLauncher.launch(Manifest.permission.CAMERA)
            }
        }

        errorMessage?.let { message ->
            Text(
                text = message,
                color = Color.White,
                modifier = Modifier
                    .align(Alignment.Center)
                    .padding(24.dp)
                    .background(Color.Black.copy(alpha = 0.6f))
                    .padding(12.dp)
            )
        }
    }
}

private fun takePhoto(
    context: android.content.Context,
    imageCapture: ImageCapture,
    executor: Executor,
    onSuccess: (android.graphics.Bitmap) -> Unit,
    onError: (String) -> Unit
) {
    val photoFile = CameraCaptureUtils.createCaptureFile(context)
    val outputOptions = ImageCapture.OutputFileOptions.Builder(photoFile).build()

    imageCapture.takePicture(
        outputOptions,
        executor,
        object : ImageCapture.OnImageSavedCallback {
            override fun onImageSaved(outputFileResults: ImageCapture.OutputFileResults) {
                try {
                    val oriented = CameraCaptureUtils.loadOrientedBitmap(photoFile)
                    val cropped = CameraCaptureUtils.cropToGuideFrame(oriented)
                    photoFile.delete()
                    onSuccess(cropped)
                } catch (e: Exception) {
                    Log.e(TAG, "Failed to process capture", e)
                    photoFile.delete()
                    onError("Could not process photo: ${e.message}")
                }
            }

            override fun onError(exception: ImageCaptureException) {
                Log.e(TAG, "Capture failed", exception)
                photoFile.delete()
                onError("Capture failed: ${exception.message}")
            }
        }
    )
}
