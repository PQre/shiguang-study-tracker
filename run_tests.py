import sys
import uuid
from pathlib import Path

ROOT=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT/".deps"))
sys.path.insert(0,str(ROOT))
import pytest

if __name__=="__main__":
    temporary=ROOT/".test-work"/uuid.uuid4().hex
    if ROOT not in temporary.resolve().parents:
        raise SystemExit("测试临时目录必须在项目内")
    temporary.parent.mkdir(parents=True, exist_ok=True)
    (ROOT/"evidence").mkdir(parents=True, exist_ok=True)
    raise SystemExit(pytest.main([str(ROOT/"tests"),"-q","--tb=short",
        "--basetemp="+str(temporary),"--junitxml="+str(ROOT/"evidence"/"api-tests.xml")]))
