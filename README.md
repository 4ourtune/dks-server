# Digital Key System

디지털 키 시스템 백엔드 서버 - TC375 마이크로컨트롤러와 스마트폰 앱을 위한 API 서버

## 🚀 빠른 시작

### 1. 저장소 클론
```bash
git clone <repository-url>
cd digital_key_system
```

### 2. 개발 환경 실행
```bash
cd docker
docker-compose up -d
```

### 3. 서비스 접속
- **API 서버**: http://localhost:3000
- **pgAdmin (DB 관리)**: http://localhost:8081
  - Email: `admin@example.com`
  - Password: `admin`
- **PostgreSQL**: localhost:5432

## 🛠️ 기술 스택

- **Backend**: TypeScript + Express.js
- **Database**: PostgreSQL 15
- **Container**: Docker + Docker Compose
- **Dev Tools**: pgAdmin, nodemon (hot reload)

## 📁 프로젝트 구조

```
digital_key_system/
├── .env.development            # 개발용 환경변수
├── .env.production             # 프로덕션용 환경변수 
├── .env.example                # 환경변수 예시
├── docker/                     # Docker 설정
│   ├── docker-compose.yml      # 개발환경 (pgAdmin 포함)
│   ├── docker-compose.prod.yml # 프로덕션환경 (pgAdmin 제외)
│   ├── Dockerfile              # API 서버 빌드
│   ├── setup.sh                # Unix/Mac 자동 설정
│   ├── setup.bat               # Windows 자동 설정
│   └── SETUP.md                # 설정 가이드
├── database/                   # 데이터베이스 스키마
│   ├── postgres-schema.sql     # 테이블 정의
│   └── seed-data.sql          # 테스트 데이터
├── server/                     # Express 서버
│   ├── src/                   # TypeScript 소스코드
│   │   ├── app.ts             # 메인 애플리케이션
│   │   ├── controllers/       # API 컨트롤러
│   │   ├── database/          # DB 연결 및 초기화
│   │   ├── middleware/        # 인증, 검증 미들웨어
│   │   ├── models/           # 데이터 모델
│   │   ├── routes/           # API 라우트
│   │   ├── services/         # 비즈니스 로직
│   │   └── types/            # TypeScript 타입 정의
│   ├── tests/                # 테스트 파일
│   ├── package.json          # Node.js 의존성
│   └── tsconfig.json         # TypeScript 설정
└── README.md                 # 이 파일
```

## 🔧 개발 환경 설정

### 사전 요구사항
- Docker Desktop
- Git

### 환경변수 설정
환경변수는 자동으로 생성되지만, 필요시 수정 가능:

```bash
# .env.development (root directory)
DB_HOST=postgres
DB_PORT=5432
DB_NAME=digital_key_system
DB_USER=postgres
DB_PASSWORD=password
JWT_SECRET=dev-secret-key-change-in-production
PGADMIN_EMAIL=admin@example.com
PGADMIN_PASSWORD=admin
```

### 개발 서버 실행
```bash
cd docker
docker-compose up -d    # 백그라운드 실행
docker-compose logs -f  # 로그 실시간 확인
docker-compose ps       # 컨테이너 상태 확인
```

### 개발 서버 종료
```bash
cd docker
docker-compose down
```

## 📊 API 엔드포인트

### 시스템 상태
- `GET /` - API 정보
- `GET /health` - 헬스체크
- `GET /api/status` - 서버 상태 및 통계

### 인증
- `POST /api/auth/register` - 사용자 등록
- `POST /api/auth/login` - 로그인
- `GET /api/auth/profile` - 프로필 조회

### 차량 관리
- `POST /api/vehicles` - 차량 등록
- `GET /api/vehicles` - 차량 목록
- `POST /api/vehicles/:id/unlock` - 차량 제어
- `GET /api/vehicles/:id/status` - 차량 상태

### 디지털 키
- `POST /api/keys/register` - 키 등록
- `GET /api/keys` - 키 목록

### 테스트
- `POST /api/test` - 테스트 엔드포인트

## 🔌 WebSocket 이벤트

- `vehicle:connect` - TC375 디바이스 연결
- `vehicle:command` - 차량 명령 전송
- `vehicle:status_request` - 상태 업데이트 요청

## 🗄️ 데이터베이스

### 테이블 구조
- `users` - 사용자 정보
- `vehicles` - 차량 정보
- `digital_keys` - 디지털 키 정보
- `access_logs` - 접근 로그

### DB 접속 (pgAdmin)
1. http://localhost:8081 접속
2. `admin@example.com` / `admin` 로그인
3. 서버 추가:
   - Host: `postgres`
   - Port: `5432`
   - Database: `digital_key_system`
   - Username: `postgres`
   - Password: `password`

## 🏗️ 빌드 및 배포

### 프로덕션 빌드
```bash
cd docker
docker-compose -f docker-compose.prod.yml up -d
```

### 로컬 개발 (Docker 없이)
```bash
cd server
npm install
npm run dev    # 개발 모드 (nodemon)
npm run build  # TypeScript 빌드
npm start      # 프로덕션 모드
```

## 🧪 테스트

```bash
cd server
npm test
```

## 📝 로그 확인

```bash
# 모든 서비스 로그
docker-compose logs

# 특정 서비스 로그
docker-compose logs api
docker-compose logs postgres
docker-compose logs pgadmin

# 실시간 로그
docker-compose logs -f api
```

## 🔍 트러블슈팅

### 컨테이너가 시작되지 않을 때
```bash
docker-compose down
docker-compose up -d --build  # 이미지 재빌드
```

### 데이터베이스 연결 오류
```bash
docker-compose logs postgres  # PostgreSQL 로그 확인
docker-compose restart postgres
```

### 포트 충돌
기본 포트를 사용 중이라면 `docker-compose.yml`에서 포트 변경:
```yaml
ports:
  - "3001:3000"  # API 서버
  - "8082:80"    # pgAdmin
  - "5433:5432"  # PostgreSQL
```

## 📋 개발 체크리스트

새로운 개발자를 위한 체크리스트:

- [ ] Docker Desktop 설치 및 실행
- [ ] 저장소 클론
- [ ] `cd docker && docker-compose up -d` 실행
- [ ] http://localhost:3000 접속 확인
- [ ] http://localhost:8081 pgAdmin 접속 확인
- [ ] API 테스트: `curl http://localhost:3000/health`

## 🤝 기여 방법

1. Fork 프로젝트
2. Feature 브랜치 생성 (`git checkout -b feature/AmazingFeature`)
3. 변경사항 커밋 (`git commit -m 'Add some AmazingFeature'`)
4. 브랜치에 푸시 (`git push origin feature/AmazingFeature`)
5. Pull Request 오픈

## 📄 라이선스

MIT License