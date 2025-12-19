# API 변경사항 (프론트엔드 → 서버)

## 변경일: 2025-12-18

### 1. 파일 업로드 API (`POST /antlr/fileUpload`)

**요청 (multipart/form-data):**

**metadata 파트 (JSON):**
```json
{
  "strategy": "framework",
  "target": "java",
  "projectName": "MyProject"
}
```

**변경 사항:**
- ❌ `ddl` 필드 제거됨
- ✅ DDL 파일은 multipart의 `files` 파트에서 filename 경로(`MyProject/ddl/...`)로 자동 구분

**files 파트 (multipart):**
- 모든 파일(일반 + DDL)이 `files` 파트로 전송
- filename 형식: `{projectName}/{상대경로}/{파일명}`
- 예: `MyProject/user/UserService.java`, `MyProject/ddl/tables/a.sql`

---

**응답 (JSON):**
```json
{
  "projectName": "MyProject",
  "files": [
    {
      "fileName": "MyProject/user/UserService.java",
      "fileContent": "package user;\n\npublic class UserService {...}"
    },
    {
      "fileName": "MyProject/user/UserController.java",
      "fileContent": "package user;\n\npublic class UserController {...}"
    }
  ],
  "ddlFiles": [
    {
      "fileName": "MyProject/ddl/tables/a.sql",
      "fileContent": "CREATE TABLE users (...);"
    },
    {
      "fileName": "MyProject/ddl/b.sql",
      "fileContent": "CREATE TABLE posts (...);"
    }
  ]
}
```

**응답 구조:**
- `projectName`: 프로젝트명
- `files`: 일반 파일 배열 (각 항목은 `fileName`과 `fileContent` 포함)
- `ddlFiles`: DDL 파일 배열 (각 항목은 `fileName`과 `fileContent` 포함)
- `fileName`: 전체 경로 (`{projectName}/{상대경로}/{파일명}` 형식)
- `fileContent`: 파일 내용 (문자열)

---

### 2. 파싱 API (`POST /antlr/parsing`)

**요청 (application/json):**
```json
{
  "strategy": "framework",
  "target": "java",
  "projectName": "MyProject"
}
```

**중요:**
- ✅ **메타데이터만 전송** (JSON body)
- ❌ 파일 내용 전송 없음 (이미 업로드 단계에서 서버에 저장됨)
- ❌ multipart/form-data 사용 안 함
- ❌ `ddl` 필드 제거됨

**동작 방식:**
1. 파일은 이미 `POST /antlr/fileUpload`에서 서버에 업로드됨
2. 파싱 요청은 `projectName`으로 이미 업로드된 파일을 찾아서 파싱
3. 서버는 해당 프로젝트의 모든 파일을 자동으로 파싱

---

### 3. 파싱 응답 (`POST /antlr/parsing` Response)


**변경 후:**
```json
{
  "projectName": "MyProject",
  "status": "complete"
}
```

또는 단순히 HTTP 200 OK만 반환

**변경 사항:**
- ❌ `files` 배열 제거됨
- ❌ `analysisResult` (AST JSON) 제거됨
- ✅ 파싱 완료 상태만 반환

