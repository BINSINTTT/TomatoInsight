package com.tomatoinsight.ui.screens

import android.content.Context
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.google.firebase.auth.FirebaseAuth
import com.tomatoinsight.R
import kotlinx.coroutines.delay

private const val SPLASH_HOLD_MS = 1_800L

/** Soft muted red — easier on the eyes than bright tomato red. */
private val SplashBackground = Color(0xFFB85C54)

/** Lighter coral-red so “Tomato” stays red and readable on the soft red backdrop. */
private val SplashTomatoWord = Color(0xFFFFC4BC)

private val SplashInsightWord = Color(0xFFFFF8F6)

/** Route after the splash screen for the current auth and onboarding state. */
fun appRouteAfterSplash(auth: FirebaseAuth, context: Context): String =
    when {
        auth.currentUser != null -> "dashboard"
        !hasSeenOnboarding(context) -> "onboarding"
        else -> "login"
    }

@Composable
fun SplashScreen(onFinished: () -> Unit) {
    var started by remember { mutableStateOf(false) }
    val logoAlpha by animateFloatAsState(
        targetValue = if (started) 1f else 0f,
        animationSpec = tween(durationMillis = 500),
        label = "splashLogo"
    )

    LaunchedEffect(Unit) {
        started = true
        delay(SPLASH_HOLD_MS)
        onFinished()
    }

    val title = buildAnnotatedString {
        withStyle(
            SpanStyle(
                color = SplashTomatoWord,
                fontWeight = FontWeight.Bold,
                shadow = Shadow(
                    color = Color(0x66000000),
                    offset = Offset(0f, 1.5f),
                    blurRadius = 4f
                )
            )
        ) {
            append("Tomato")
        }
        withStyle(
            SpanStyle(
                color = SplashInsightWord,
                fontWeight = FontWeight.SemiBold
            )
        ) {
            append("Insight")
        }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(SplashBackground),
        contentAlignment = Alignment.Center
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 32.dp)
                .alpha(logoAlpha)
        ) {
            Image(
                painter = painterResource(R.drawable.splash_logo),
                contentDescription = "TomatoInsight logo",
                modifier = Modifier.fillMaxWidth(0.62f),
                contentScale = ContentScale.Fit
            )
            Spacer(modifier = Modifier.height(20.dp))
            Text(
                text = title,
                fontSize = 28.sp,
                letterSpacing = 0.4.sp
            )
            Spacer(modifier = Modifier.height(24.dp))
            CircularProgressIndicator(
                modifier = Modifier.size(28.dp),
                color = SplashInsightWord,
                strokeWidth = 2.5.dp
            )
        }
    }
}
