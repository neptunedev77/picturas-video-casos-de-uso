const amqp = require('amqplib/callback_api');

const rabbit_host = process.env.RABBITMQ_HOST;
const rabbit_port = process.env.RABBITMQ_PORT;
const rabbit_username = process.env.RABBITMQ_USER;
const rabbit_password = process.env.RABBITMQ_PASS;
const exchange = "picturas";

const rabbit_mq_sv = `amqp://${rabbit_username}:${rabbit_password}@${rabbit_host}:${rabbit_port}`;

// options (optional): { queueArguments, priority }. With queueArguments the queue is declared and
// bound before publishing, so a request is never dropped before its worker has started.
function send_rabbit_msg(msg, queue, options) {
    amqp.connect(rabbit_mq_sv, (err_sv, connection) => {
        if (err_sv) throw err_sv;

        connection.createChannel( (err_conn, channel) => {
            if (err_conn) throw err_conn;

            channel.assertExchange(exchange, 'direct', {
                durable: true
            });

            const publish = () => channel.publish(exchange, queue, Buffer.from(JSON.stringify(msg)),
                options ? { persistent: true, priority: options.priority || 0 } : undefined);
            if (!options?.queueArguments) return publish();
            channel.assertQueue(queue, { durable: true, arguments: options.queueArguments }, (err_queue) => {
                if (err_queue) throw err_queue;
                channel.bindQueue(queue, exchange, queue, {}, (err_bind) => {
                    if (err_bind) throw err_bind;
                    publish();
                });
            });
        });
        
        setTimeout(() => {
            connection.close();
        }, 500);
    });
    
}

function read_rabbit_msg(queue, callback) {
    amqp.connect(rabbit_mq_sv, (err_sv, connection) => {
        if (err_sv) throw err_sv;

        connection.createChannel((err_conn, channel) => {
            if (err_conn) throw err_conn;

            channel.assertExchange(exchange, 'direct', {
                durable: true
              });

            channel.assertQueue(queue, { durable: true }, (err_queue, q) => {
                if(err_queue) throw err_queue;

                channel.consume(q.queue, (msg) => {
                    if(msg != null){
                        callback(msg);
                        // Acknowledge the message
                        channel.ack(msg);
                    }
                }, {
                    noAck: false
                });
            });
        });
    });
}

module.exports = { send_rabbit_msg, read_rabbit_msg };
