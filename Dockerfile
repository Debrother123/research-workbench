FROM python:3.12-slim
WORKDIR /app
COPY . .
EXPOSE 8765
CMD ["python", "server.py", "--workspace", "demo-workspace", "--port", "8765"]
