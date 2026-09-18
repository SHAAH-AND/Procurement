import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';

describe('Tenant Isolation (e2e)', () => {
  let app: INestApplication;
  let tokenA: string;
  let tokenB: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    // Sign in Tenant A
    const resA = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'admin@acme.com', password: 'password123' })
      .expect(201);
    tokenA = resA.body.access_token;

    // Sign in Tenant B
    const resB = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'admin@globex.com', password: 'password123' })
      .expect(201);
    tokenB = resB.body.access_token;
  });

  afterAll(async () => {
    await app.close();
  });

  it('Tenant A can only see Tenant A users', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
      
    // Assert all returned users belong to Tenant A
    expect(res.body.length).toBeGreaterThan(0);
    const hasTenantBUser = res.body.some((u: any) => u.email === 'admin@globex.com');
    expect(hasTenantBUser).toBe(false);
  });

  it('Tenant B can only see Tenant B users', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(200);
      
    expect(res.body.length).toBeGreaterThan(0);
    const hasTenantAUser = res.body.some((u: any) => u.email === 'admin@acme.com');
    expect(hasTenantAUser).toBe(false);
  });
});
