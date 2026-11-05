package com.tomatoinsight.util

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow

/** True when the phone has a network that Android has validated for internet access. */
fun Context.hasValidatedInternet(): Boolean {
    val manager = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
    val network = manager.activeNetwork ?: return false
    val capabilities = manager.getNetworkCapabilities(network) ?: return false
    return capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) &&
        capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
}

/** Emits when the validated internet connection appears or drops. */
fun Context.observeValidatedInternet(): Flow<Boolean> = callbackFlow {
    val manager = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
    val callback = object : ConnectivityManager.NetworkCallback() {
        override fun onAvailable(network: Network) {
            trySend(hasValidatedInternet())
        }

        override fun onLost(network: Network) {
            trySend(false)
        }

        override fun onCapabilitiesChanged(network: Network, networkCapabilities: NetworkCapabilities) {
            trySend(hasValidatedInternet())
        }
    }
    manager.registerDefaultNetworkCallback(callback)
    trySend(hasValidatedInternet())
    awaitClose { manager.unregisterNetworkCallback(callback) }
}
