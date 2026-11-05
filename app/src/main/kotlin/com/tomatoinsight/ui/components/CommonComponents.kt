package com.tomatoinsight.ui.components

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CameraAlt
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Monitor
import androidx.compose.material.icons.filled.Person
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.tomatoinsight.ui.theme.TomatoGreen

private val BottomBarBackground = Color(0xFFF8F9FA)

@Composable
fun CustomBottomBar(
    selectedTab: String = "home",
    hideNavIcons: Boolean = false,
    containerColor: Color = BottomBarBackground,
    cameraEnabled: Boolean = true,
    onHomeClick: () -> Unit = {},
    onMonitoringClick: () -> Unit = {},
    onCameraClick: () -> Unit = {},
    onHistoryClick: () -> Unit = {},
    onProfileClick: () -> Unit = {}
) {
    val cameraSize = if (hideNavIcons) 78.dp else 68.dp
    val cameraIconSize = if (hideNavIcons) 38.dp else 32.dp

    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(if (hideNavIcons) cameraSize + 8.dp else 90.dp)
            .background(containerColor),
        contentAlignment = Alignment.BottomCenter
    ) {
        if (!hideNavIcons) {
            Surface(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(68.dp),
                color = containerColor,
                shadowElevation = 8.dp
            ) {
                Row(
                    modifier = Modifier.fillMaxSize(),
                    horizontalArrangement = Arrangement.SpaceEvenly,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    // 1. Home
                    Box(
                        modifier = Modifier.weight(1f),
                        contentAlignment = Alignment.Center
                    ) {
                        BottomNavItem(
                            icon = Icons.Filled.Home,
                            label = "Home",
                            isSelected = selectedTab == "home",
                            onClick = onHomeClick
                        )
                    }

                    // 2. Monitoring
                    Box(
                        modifier = Modifier.weight(1f),
                        contentAlignment = Alignment.Center
                    ) {
                        BottomNavItem(
                            icon = Icons.Filled.Monitor,
                            label = "Monitoring",
                            isSelected = selectedTab == "monitoring",
                            onClick = onMonitoringClick
                        )
                    }

                    // 3. Center Camera Slot
                    Box(
                        modifier = Modifier.weight(1f),
                        contentAlignment = Alignment.Center
                    ) {
                        // Empty space for floating camera FAB
                    }

                    // 4. History
                    Box(
                        modifier = Modifier.weight(1f),
                        contentAlignment = Alignment.Center
                    ) {
                        BottomNavItem(
                            icon = Icons.Filled.History,
                            label = "History",
                            isSelected = selectedTab == "history",
                            onClick = onHistoryClick
                        )
                    }

                    // 5. Profile
                    Box(
                        modifier = Modifier.weight(1f),
                        contentAlignment = Alignment.Center
                    ) {
                        BottomNavItem(
                            icon = Icons.Filled.Person,
                            label = "Profile",
                            isSelected = selectedTab == "profile",
                            onClick = onProfileClick
                        )
                    }
                }
            }
        }

        // Floating Camera Button (Bigger when hideNavIcons is TRUE)
        Surface(
            modifier = Modifier
                .size(cameraSize)
                .offset(y = if (hideNavIcons) 0.dp else (-18).dp),
            shape = CircleShape,
            color = if (cameraEnabled) TomatoGreen else Color(0xFFBDBDBD),
            shadowElevation = if (cameraEnabled) 8.dp else 0.dp
        ) {
            Box(contentAlignment = Alignment.Center) {
                IconButton(onClick = onCameraClick, enabled = cameraEnabled) {
                    Icon(
                        imageVector = Icons.Filled.CameraAlt,
                        contentDescription = "Camera",
                        modifier = Modifier.size(cameraIconSize),
                        tint = if (cameraEnabled) Color.White else Color(0xFFEEEEEE)
                    )
                }
            }
        }
    }
}

@Composable
fun BottomNavItem(
    icon: ImageVector,
    label: String,
    isSelected: Boolean = false,
    onClick: () -> Unit
) {
    val tint by animateColorAsState(
        targetValue = if (isSelected) TomatoGreen else Color(0xFF757575),
        animationSpec = tween(220, easing = FastOutSlowInEasing),
        label = "navTint"
    )
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
        modifier = Modifier
            .clip(RoundedCornerShape(8.dp))
            .clickable { onClick() }
            .padding(vertical = 4.dp, horizontal = 4.dp)
    ) {
        Icon(
            imageVector = icon,
            contentDescription = label,
            modifier = Modifier.size(24.dp),
            tint = tint
        )
        Text(
            text = label,
            fontSize = 10.sp,
            fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Medium,
            color = tint,
            maxLines = 1
        )
    }
}
