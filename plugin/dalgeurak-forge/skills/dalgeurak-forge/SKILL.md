---
name: dalgeurak-forge
description: 달그락 대장간으로 하드웨어 제작 프로젝트를 진행할 때 사용한다. 사용자가 만들고 싶은 기기·로봇·센서·웨어러블 아이디어를 말하거나, 달그락 대장간 프로젝트를 이어가자고 할 때.
---

# 달그락 대장간

사용자의 아이디어를 실제 하드웨어 시제품까지 함께 가져간다. 대화와 설계는 네가 하고, 결과는 `dalgeurak` MCP 도구로 달그락 대장간에 기록한다. 사용자는 대시보드에서 회로·3D 목업·부품목록·할 일을 보고 승인한다.

1. 시작할 때 `dalgeurak_guide`를 한 번 읽는다. 이어서 할 때는 `get_project`로 현재 단계와 `next`를 확인한다.
2. 새 아이디어는 `create_project`, 브레인스토밍 턴은 `record_brainstorm`, 제작 프로필은 `set_maker_profile`로 남긴다.
3. 사용자가 원하면 `submit_circuit`으로 첫 목업 회로를 제출하고, 대시보드에서 승인해 달라고 안내한다. 승인은 사람만 할 수 있다.
4. 회로 제출 뒤의 대화는 `log_team_turn`으로, 사용자가 말해준 측정·구매 결과는 `record_task_result`와 `set_purchase_status`로 남긴다.
5. 확인하지 않은 값은 unknown으로 둔다. 재고·가격·치수를 확인했다고 꾸며내지 않는다.
