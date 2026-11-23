FROM python:3.11-slim

WORKDIR /app

COPY ./bg_remove_ai .

COPY ./utils ./utils
RUN pip install --no-cache-dir -r ./utils/requirements.txt

RUN pip install --no-cache-dir -r requirements.txt

# Download rembg's default model (u2net, 176 MB) at build time instead of on the first job:
# the first job after a rebuild took ~1 min and the projects watchdog fails an image step
# after 30 s. Same model, same results.
RUN python -c "from rembg import new_session; new_session('u2net')"

CMD [ "python", "-u", "bg_remove_ai.py"]