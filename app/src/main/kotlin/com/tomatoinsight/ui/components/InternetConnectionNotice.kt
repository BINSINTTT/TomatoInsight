package com.tomatoinsight.ui.components

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Wifi
import androidx.compose.material.icons.filled.WifiOff
import androidx.compose.material3.Icon
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.tomatoinsight.ui.theme.TomatoGreen
import com.tomatoinsight.util.hasValidatedInternet
import com.tomatoinsight.util.observeValidatedInternet
import kotlinx.coroutines.delay

/** Remembers the last connection state so opening another page does not show the notice again. */
private object InternetNoticeMemory {
    var lastSeen: Boolean? = null
}

/** Shows the connection notice for 5 seconds after the internet state changes, then folds it away. */
@Composable
fun InternetConnectionNotice(modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val online by produceState(initialValue = context.hasValidatedInternet(), context) {
        context.observeValidatedInternet().collect { value = it }
    }
    var visible by remember { mutableStateOf(false) }
    LaunchedEffect(online) {
        val previous = InternetNoticeMemory.lastSeen
        InternetNoticeMemory.lastSeen = online
        if (previous == null || previous == online) {
            visible = false
            return@LaunchedEffect
        }
        visible = true
        delay(5_000)
        visible = false
    }

    AnimatedVisibility(
        visible = visible,
        modifier = modifier,
        enter = fadeIn(tween(350)) + expandVertically(tween(350)),
        exit = fadeOut(tween(400)) + shrinkVertically(tween(400))
    ) {
        Column {
            InternetStatusBanner(online = online)
            Spacer(modifier = Modifier.height(12.dp))
        }
    }
}

@Composable
private fun InternetStatusBanner(online: Boolean) {
    val accent = if (online) TomatoGreen else Color(0xFFEF6C00)
    val background = if (online) Color(0xFFE8F5E9) else Color(0xFFFFF3E0)
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        color = background
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 14.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(
                imageVector = if (online) Icons.Default.Wifi else Icons.Default.WifiOff,
                contentDescription = null,
                tint = accent,
                modifier = Modifier.size(22.dp)
            )
            Spacer(modifier = Modifier.width(10.dp))
            Column {
                Text(
                    text = if (online) "Internet connected" else "No internet connection",
                    color = accent,
                    fontWeight = FontWeight.Bold,
                    fontSize = 14.sp
                )
                Text(
                    text = if (online) {
                        "Recommendations and sync are available."
                    } else {
                        "Leaf check still works. Recommendations need internet."
                    },
                    color = Color(0xFF616161),
                    fontSize = 12.sp
                )
            }
        }
    }
}

/** Green while online, red while offline. Blinks in place. */
@Composable
fun ConnectionStatusDot(
    modifier: Modifier = Modifier,
    size: Dp = 14.dp,
    ring: Boolean = false,
    online: Boolean? = null
) {
    val context = LocalContext.current
    val observed by produceState(initialValue = context.hasValidatedInternet(), context) {
        context.observeValidatedInternet().collect { value = it }
    }
    val isOnline = online ?: observed
    val pulse = rememberInfiniteTransition(label = "connectionDot")
    val alpha by pulse.animateFloat(
        initialValue = 1f,
        targetValue = 0.25f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 700),
            repeatMode = RepeatMode.Reverse
        ),
        label = "connectionDotAlpha"
    )
    val color = if (ring) {
        if (isOnline) Color(0xFF69F0AE) else Color(0xFFFF1744)
    } else {
        if (isOnline) TomatoGreen else Color(0xFFE53935)
    }
    Box(
        modifier = modifier
            .size(if (ring) size + 4.dp else size)
            .graphicsLayer { this.alpha = alpha }
            .clip(CircleShape)
            .background(if (ring) Color.White else color),
        contentAlignment = Alignment.Center
    ) {
        if (ring) {
            Box(
                modifier = Modifier
                    .size(size)
                    .clip(CircleShape)
                    .background(color)
            )
        }
    }
}

/** Blinking status color with Online/Offline label — same pattern as the home red card. */
@Composable
fun ConnectionStatusIndicator(
    modifier: Modifier = Modifier,
    labelColor: Color = Color(0xFF0F172A),
    dotSize: Dp = 10.dp,
    ring: Boolean = false
) {
    val context = LocalContext.current
    val online by produceState(initialValue = context.hasValidatedInternet(), context) {
        context.observeValidatedInternet().collect { value = it }
    }
    Row(
        modifier = modifier,
        verticalAlignment = Alignment.CenterVertically
    ) {
        ConnectionStatusDot(size = dotSize, ring = ring, online = online)
        Spacer(modifier = Modifier.width(6.dp))
        Text(
            text = if (online) "Online" else "Offline",
            color = labelColor,
            fontSize = 13.sp,
            fontWeight = FontWeight.Medium
        )
    }
}
