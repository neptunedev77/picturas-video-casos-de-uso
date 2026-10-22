"""Independent UC-VID-002 RabbitMQ worker (one job at a time)."""
import json
from pathlib import Path
import re
import time

import pika

import config
from authorization import authorize_start, release_failed_launch, check_control
from compressor import compress
from media import CompressionError


def validate_paths(job):
    job_id = str(job.get("jobId", ""))
    if not re.fullmatch(r"[0-9a-f]{24}", job_id):
        raise CompressionError("INVALID_REQUEST", "Invalid compression job id.")
    directory = config.ROOT.resolve() / job_id
    source = Path(job.get("inputPath", "")).resolve()
    output = Path(job.get("outputPath", "")).resolve()
    if source != directory / "source.mp4" or output != directory / "result.mp4":
        raise CompressionError("INVALID_PATH", "Invalid compression paths.")
    return source, output


class CompressionWorker:
    def process(self, job, publish, tick, redelivered=False):
        try:
            source, output = validate_paths(job)
            if redelivered:
                raise CompressionError("WORKER_INTERRUPTED", "The worker was interrupted; create a new job to retry.")
            result = compress(
                source, output, job.get("quality"), job.get("userType"),
                progress=lambda pct: publish({"jobId": job["jobId"], "status": "processing", "progress": pct}),
                tick=tick,
                before_start=lambda meta: authorize_start(job, meta),
                launch_failed=lambda: release_failed_launch(job),
                check_cancel=lambda: check_control(job),
                launched=lambda: check_control(job, launched=True),
            )
            publish({"jobId": job["jobId"], "status": "completed", "result": result})
        except pika.exceptions.AMQPError:
            # Leave delivery unacked: redelivery reports interruption, never re-encodes.
            raise
        except Exception as e:
            print(f"[COMPRESSION][ERROR] {e}", flush=True)
            if isinstance(e, CompressionError) and e.code == "JOB_CANCELLED":
                publish({"jobId": job.get("jobId"), "status": "cancelled"})
            else:
                publish({"jobId": job.get("jobId"), "status": "failed", "error": {
                    "code": getattr(e, "code", "PROCESSING_FAILED"),
                    "message": str(e) if isinstance(e, CompressionError) else "Compression failed.",
                }})

    def run(self):
        while True:
            connection = None
            try:
                connection = pika.BlockingConnection(pika.ConnectionParameters(
                    host=config.RABBITMQ_HOST, port=config.RABBITMQ_PORT,
                    credentials=pika.PlainCredentials(config.RABBITMQ_USER, config.RABBITMQ_PASS),
                    heartbeat=60, blocked_connection_timeout=60,
                ))
                channel = connection.channel()
                channel.exchange_declare(exchange=config.EXCHANGE, exchange_type="direct", durable=True)
                for name, arguments in ((config.REQUESTS_QUEUE, config.REQUESTS_QUEUE_ARGS), (config.RESULTS_QUEUE, None)):
                    channel.queue_declare(queue=name, durable=True, arguments=arguments)
                    channel.queue_bind(exchange=config.EXCHANGE, queue=name, routing_key=name)
                channel.confirm_delivery()
                channel.basic_qos(prefetch_count=1)

                def publish(body):
                    channel.basic_publish(
                        exchange=config.EXCHANGE, routing_key=config.RESULTS_QUEUE,
                        body=json.dumps(body), mandatory=True,
                        properties=pika.BasicProperties(delivery_mode=2, content_type="application/json"),
                    )

                def callback(ch, method, properties, body):
                    try:
                        job = json.loads(body)
                        if not isinstance(job, dict):
                            raise ValueError("Expected an object")
                    except (ValueError, UnicodeDecodeError):
                        ch.basic_reject(method.delivery_tag, requeue=False)
                        return
                    self.process(job, publish, lambda: connection.process_data_events(time_limit=0), method.redelivered)
                    ch.basic_ack(method.delivery_tag)

                channel.basic_consume(queue=config.REQUESTS_QUEUE, on_message_callback=callback, auto_ack=False)
                print(f"[COMPRESSION] Listening on {config.REQUESTS_QUEUE}", flush=True)
                channel.start_consuming()
            except (pika.exceptions.AMQPError, OSError) as e:
                print(f"[COMPRESSION][MQ] {e}; reconnecting in 5 seconds", flush=True)
                time.sleep(5)
            finally:
                if connection is not None and connection.is_open:
                    connection.close()


if __name__ == "__main__":
    CompressionWorker().run()
