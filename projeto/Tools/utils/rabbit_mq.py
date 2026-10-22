import pika
from pika.exchange_type import ExchangeType

"""
# Callback example for those who need it
def callback(ch, method, properties, body):
    print(f" [x] Received {body.decode()}")
"""

class Rabbit_MQ:
    def __init__(self, host, port, username, password):
        self._host = host
        self._port = port
        self._credentials = pika.PlainCredentials(username, password)
        self._connection = pika.BlockingConnection(pika.ConnectionParameters(self._host, self._port, '/', self._credentials),)
        self._channel = self._connection.channel()
        self._queue = ''
        self._queue_args = None

        self._channel.exchange_declare(
            exchange="picturas",
            exchange_type=ExchangeType.direct,
            durable=True,
        )

    def send_rabbit_msg(self, msg, queue):
        # Same arguments as when consuming: a different declaration would close the channel.
        self._channel.queue_declare(queue=self._queue, durable=True, arguments=self._queue_args)

        self._channel.basic_publish(exchange="picturas", routing_key=queue, body=msg)

    
    def read_rabbit_msg(self, queue, callback, arguments=None, manual_ack=False):
        """arguments: queue arguments (e.g. x-max-priority). manual_ack: take one request at a
        time and acknowledge it only after the callback, so queue priority decides the next one."""
        if self._queue == "":
            self._queue = queue
        self._queue_args = arguments

        self._channel.queue_declare(queue=self._queue, durable=True, arguments=arguments)
        self._channel.queue_bind(exchange="picturas", queue=self._queue, routing_key=self._queue)

        on_message = callback
        if manual_ack:
            self._channel.basic_qos(prefetch_count=1)

            def on_message(ch, method, properties, body):
                try:
                    callback(ch, method, properties, body)
                finally:
                    # Acknowledge even after an error: the tool already reported it; never loop on it.
                    ch.basic_ack(delivery_tag=method.delivery_tag)

        self._channel.basic_consume(
            queue=self._queue,
            on_message_callback=on_message,
            auto_ack=not manual_ack,
        )

        self._channel.start_consuming()
