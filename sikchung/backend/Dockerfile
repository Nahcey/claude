FROM public.ecr.aws/lambda/python:3.12-arm64

RUN pip install --no-cache-dir ortools && \
    find /var/lang/lib -name "__pycache__" -type d -prune -exec rm -rf {} + 2>/dev/null; \
    find /var/lang/lib -name "*.pyc" -delete 2>/dev/null; true

COPY algo/ ${LAMBDA_TASK_ROOT}/algo/
COPY lib/ ${LAMBDA_TASK_ROOT}/lib/
COPY handlers/generate_schedule.py      ${LAMBDA_TASK_ROOT}/handlers/generate_schedule.py
COPY handlers/generate_flex_schedule.py ${LAMBDA_TASK_ROOT}/handlers/generate_flex_schedule.py

CMD ["handlers.generate_schedule.handler"]
