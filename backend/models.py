from datetime import date

from pydantic import BaseModel, ConfigDict, Field


class InputModel(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")


class PlanInput(InputModel):
    name: str = Field(min_length=1, max_length=60)
    start_date: date
    days: int = Field(ge=1, le=90, strict=True)
    target_minutes: int = Field(ge=5, le=480, strict=True)


class RecordInput(InputModel):
    plan_id: int = Field(ge=1, strict=True)
    study_date: date
    topic: str = Field(min_length=1, max_length=120)
    minutes: int = Field(ge=1, le=720, strict=True)
    takeaway: str = Field(min_length=1, max_length=1500)
    next_step: str = Field(default="", max_length=1000)
    shared: bool = False
