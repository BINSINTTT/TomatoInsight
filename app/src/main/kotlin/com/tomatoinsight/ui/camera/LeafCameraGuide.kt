package com.tomatoinsight.ui.camera

/**
 * Shared layout for the on-screen portrait oval and post-capture crop.
 */
object LeafCameraGuide {
    /** Oval width as a fraction of the preview width. */
    const val WIDTH_FRACTION = 0.72f

    /** Width / height. A value below 1 produces a tall portrait oval. */
    const val ASPECT_RATIO = 0.60f

    /** Keeps the guide clear of instructions and capture controls. */
    const val MAX_HEIGHT_FRACTION = 0.68f

    const val STROKE_WIDTH_DP = 3f
    const val OUTER_STROKE_WIDTH_DP = 5f
}
