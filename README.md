# 디지털 키 시스템 - 개발 환경 설정

## 사전 요구사항
- Docker 설치: https://www.docker.com/products/docker-desktop/

## 빠른 시작

1. **저장소 클론**
   ```bash
   git clone https://github.com/4ourtune/dks-server.git dks_server
   cd dks_server
   ```

2. **환경 파일 생성**
   ```bash
   cp .env.example .env.development
   ```
   > GitHub에는 `.env.development` 파일이 업로드되지 않습니다. `.env.example`을 복사해서 수정하여 사용하세요.

3. **개발 환경 시작**
   ```bash
   cd docker
   docker-compose up -d --build
   ```

4. **설정 확인**
   - API 서버: http://localhost:3000
   - pgAdmin: http://localhost:8081 (admin@example.com / admin)
   - PostgreSQL: localhost:5432

## 환경 설정

`.env.example` 파일에는 기본 개발 설정이 포함되어 있습니다. 필요시 다음을 수정할 수 있습니다:
- 데이터베이스 자격 증명
- JWT 비밀키 (프로덕션에서는 안전한 랜덤 문자열 사용)
- 로그 레벨
- 포트 번호

## 유용한 명령어

```bash
# 로그 확인
cd docker
docker-compose logs -f

# 서비스 중지
docker-compose down

# 데이터베이스 초기화 (모든 데이터 삭제)
docker-compose down -v
docker-compose up -d --build
```

## 문제 해결

- 3000번이나 5432번 포트가 이미 사용 중인 경우, `docker-compose.yml`에서 포트를 수정하세요
- Windows 사용자는 Docker Desktop이 실행 중인지 확인하세요
- 데이터베이스 초기화는 첫 시작 시 몇 분 정도 걸릴 수 있습니다