"""全局搜索服务：按当前用户所属团队聚合任务 / 看板命中项。"""

import uuid

from sqlalchemy.orm import Session

from app.repositories.search_repo import search_repo
from app.schemas.search import SearchBoardHit, SearchData, SearchTaskHit
from app.services.team_service import team_service

DESCRIPTION_PREVIEW = 160


class SearchService:
    def search(self, db: Session, user_id: uuid.UUID, q: str, limit: int) -> SearchData:
        query = q.strip()
        if not query:
            return SearchData(query=query)

        # 只取当前用户所属团队；viewer/member 同样可读，跨租户一律不可见
        team_ids = team_service.list_user_team_ids(db, user_id)
        tasks = [
            SearchTaskHit.model_validate(row)
            for row in search_repo.search_tasks(db, team_ids, query, limit)
        ]
        boards = [
            SearchBoardHit.model_validate(row)
            for row in search_repo.search_boards(db, team_ids, query, limit)
        ]
        for task in tasks:
            if task.description and len(task.description) > DESCRIPTION_PREVIEW:
                task.description = task.description[:DESCRIPTION_PREVIEW] + "…"
        return SearchData(query=query, tasks=tasks, boards=boards)


search_service = SearchService()
