FROM public.ecr.aws/lambda/python:3.12-arm64

RUN pip install --no-cache-dir ortools

COPY algo/ ${LAMBDA_TASK_ROOT}/algo/
COPY lib/ ${LAMBDA_TASK_ROOT}/lib/
COPY handlers/generate_schedule.py ${LAMBDA_TASK_ROOT}/handlers/generate_schedule.py

CMD ["handlers.generate_schedule.handler"]
