# API 契约 v1.0

API 基址 `/api`。默认无用户认证，仅用于个人本地项目或受保护的演示环境。失败响应 `{"detail":"中文提示"}`；字段验证失败 422 为 FastAPI 标准结构。

| 方法 | 路径 | 请求／返回 | 状态 |
| --- | --- | --- | --- |
| GET | /health | `status,today,demo` | 200 |
| GET | /lessons | 28 个知识点对象 | 200 |
| GET | /plans | 计划及 completed_days,progress | 200 |
| POST | /plans | name,start_date,days,target_minutes | 201／422 |
| PUT | /plans/{id} | 完整计划字段 | 200／404／409／422 |
| DELETE | /plans/{id} | 无请求体 | 204／404／409 |
| GET | /records?plan_id= | 全部或一个计划的记录 | 200／404 |
| POST | /records | plan_id,study_date,topic,minutes,takeaway,next_step,shared | 201／404／409／422 |
| PUT | /records/{id} | 完整记录字段 | 200／404／409／422 |
| DELETE | /records/{id} | 无请求体 | 204／404 |
| GET | /stats?plan_id= | days,minutes,streak,longest_streak,shared_days,daily,recent | 200／404 |
| GET | /export.csv?plan_id= | UTF-8 BOM CSV 下载 | 200／404 |

所有 id 必须为正整数。跨站 Origin 写请求返回 403。

创建计划示例：

```json
{"name":"四周训练营","start_date":"2026-10-14","days":28,"target_minutes":45}
```

创建打卡示例（用你的真实日期和内容替换）：

```json
{"plan_id":1,"study_date":"2026-10-14","topic":"结构化提示词","minutes":45,"takeaway":"对比模糊和明确输入，检查输出格式差异。","next_step":"补充异常输入用例。","shared":false}
```

更详细的字段类型、必填项和上下限可在 `/openapi.json` 查看，在线 API 试验界面为 `/docs`（Swagger UI 的外部脚本需联网）。这些示例不证明用户已完成学习。
