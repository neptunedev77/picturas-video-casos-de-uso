// Route the whole video pipeline without changing the worker's message contract.
function selectVideoQueue(tools) {
    const hasSubtitles = Array.isArray(tools) &&
        tools.some((tool) => tool?.procedure === 'subtitles');
    return hasSubtitles ? 'video_heavy_queue' : 'video_queue';
}

module.exports = { selectVideoQueue };
