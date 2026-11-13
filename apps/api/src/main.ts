import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { configureApp } from './bootstrap.js';
import { config } from './config.js';

const app = configureApp(await NestFactory.create(AppModule, { bufferLogs: true }));
await app.listen(config.API_PORT);
