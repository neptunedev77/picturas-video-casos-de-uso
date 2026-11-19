const test = require('node:test');
const assert = require('node:assert/strict');
const { selectVideoQueue } = require('../utils/videoRouting');
const { videoPipeline } = require('../utils/video');
const rabbit = require('../utils/rabbit_mq');

function capturePublisher(t) {
    const published = [];
    t.mock.method(rabbit, 'send_rabbit_msg', (msg, queue) => {
        published.push({ msg, queue });
    });
    // project_msg captures the publisher when loaded; restore its cache after each test.
    const modulePath = require.resolve('../utils/project_msg');
    const original = require.cache[modulePath];
    delete require.cache[modulePath];
    t.after(() => {
        if (original) require.cache[modulePath] = original;
        else delete require.cache[modulePath];
    });
    return { send: require('../utils/project_msg').send_msg_tool, published };
}

test('video classification defaults to normal and only recognizes the exact subtitles procedure', () => {
    for (const tools of [undefined, null, [], [{ procedure: 'trim' }],
                         [{ procedure: 'extract_frames' }], [{ procedure: 'Subtitles' }]]) {
        assert.equal(selectVideoQueue(tools), 'video_queue');
    }
});

test('subtitles at any pipeline position select heavy without mutating the pipeline', () => {
    for (let position = 0; position < 3; position++) {
        const tools = [{ procedure: 'trim', params: { start: 1, end: 4 } },
                       { procedure: 'brightness', params: { brightness: 0.8 } }];
        tools.splice(position, 0, { procedure: 'subtitles', params: {} });
        const before = structuredClone(tools);
        assert.equal(selectVideoQueue(tools), 'video_heavy_queue');
        assert.deepEqual(tools, before);
    }
});

const trim = { procedure: 'trim', params: { imgId: 'video-a', start: 1, end: 4 } };
const captions = { procedure: 'subtitles', params: {} };
const brightness = { procedure: 'brightness', params: { brightness: 0.8 } };
const extraction = { procedure: 'extract_frames', params: { mode: 'count', count: 5, format: 'png' } };

const videoCases = [
    { name: 'normal full video', tools: [trim, brightness], preview: false, queue: 'video_queue' },
    { name: 'normal preview', tools: [trim], preview: true, queue: 'video_queue' },
    { name: 'empty video pipeline', tools: [], preview: false, queue: 'video_queue' },
    { name: 'subtitles only', tools: [captions], preview: false, queue: 'video_heavy_queue' },
    { name: 'subtitles in the middle', tools: [trim, captions, brightness], preview: false, queue: 'video_heavy_queue' },
    { name: 'preview with subtitles', tools: [trim, captions, brightness], preview: true, queue: 'video_heavy_queue' },
    { name: 'subtitles and frame extraction', tools: [captions, extraction], preview: false, queue: 'video_heavy_queue' },
    { name: 'repeated subtitles stages', tools: [captions, trim, captions], preview: false, queue: 'video_heavy_queue' },
];

for (const scenario of videoCases) {
    test(`${scenario.name}: routing preserves the video payload, ids and pipeline order`, (t) => {
        const { send, published } = capturePublisher(t);
        // Use the pipeline builder called by both the full-processing and preview routes.
        const project = { tools: scenario.tools.map((tool, position) => ({ ...tool, position })) };
        const params = {
            tools: videoPipeline(project, 'video-a'),
            preview: scenario.preview,
            progress: { user: 'runner-a', projectId: 'project-a', imgId: 'video-a' },
        };
        const before = structuredClone(params);
        const messageId = `${scenario.preview ? 'preview' : 'request'}-routing-test`;
        const timestamp = '2026-11-19T12:00:00.000Z';
        const input = './images/users/owner/projects/project-a/src/video.mp4';
        const output = `./images/users/owner/projects/project-a/${scenario.preview ? 'preview' : 'out'}/video.mp4`;
        // This is the pre-routing message shape, including its serialized field order.
        const expectedPayload = JSON.stringify({
            messageId,
            timestamp,
            procedure: 'video',
            parameters: { inputImageURI: input, outputImageURI: output, ...before },
        });

        send(messageId, timestamp, input, output, 'video', params);

        assert.equal(published.length, 1);
        assert.equal(published[0].queue, scenario.queue);
        assert.equal(published[0].msg.procedure, 'video');
        assert.equal(JSON.stringify(published[0].msg), expectedPayload);
        assert.deepEqual(params, before);
    });
}

test('image tool routing and payload remain unchanged even if params include a subtitles pipeline', (t) => {
    const { send, published } = capturePublisher(t);
    const params = { brightness: 0.8, tools: [captions] };
    const before = structuredClone(params);

    send('request-image', 'timestamp', '/in.png', '/out.png', 'brightness', params);

    assert.deepEqual(published, [{
        queue: 'brightness_queue',
        msg: {
            messageId: 'request-image',
            timestamp: 'timestamp',
            procedure: 'brightness',
            parameters: { inputImageURI: '/in.png', outputImageURI: '/out.png', ...before },
        },
    }]);
    assert.deepEqual(params, before);
});
