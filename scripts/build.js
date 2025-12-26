#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

/**
 * 프로덕션 빌드용 스크립트
 * dist/ 폴더에 최종 Chrome Extension 파일들을 생성
 */

const DIST_DIR = path.join(__dirname, '..', 'dist');
const SRC_DIR = path.join(__dirname, '..', 'src');

// dist 디렉토리 생성
if (!fs.existsSync(DIST_DIR)) {
  fs.mkdirSync(DIST_DIR, { recursive: true });
}

// manifest.json 복사 및 수정
const manifestPath = path.join(__dirname, '..', 'manifest.json');
const distManifestPath = path.join(DIST_DIR, 'manifest.json');

if (fs.existsSync(manifestPath)) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  
  // 프로덕션용 설정 적용
  manifest.background = {
    service_worker: 'background.js',
    type: 'module'
  };
  
  fs.writeFileSync(distManifestPath, JSON.stringify(manifest, null, 2));
  console.log('✓ manifest.json 생성 완료');
}

// 정적 파일들 복사
const staticFiles = [
  'sounds',
  'icons',
  'thirdParty',
  'welcome.html',
  'popup.css'
];

staticFiles.forEach(file => {
  const srcPath = path.join(__dirname, '..', file);
  const distPath = path.join(DIST_DIR, file);
  
  if (fs.existsSync(srcPath)) {
    copyRecursive(srcPath, distPath);
    console.log(`✓ ${file} 복사 완료`);
  }
});

function copyRecursive(src, dest) {
  const stat = fs.statSync(src);
  
  if (stat.isDirectory()) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    
    fs.readdirSync(src).forEach(item => {
      copyRecursive(path.join(src, item), path.join(dest, item));
    });
  } else {
    fs.copyFileSync(src, dest);
  }
}

console.log('🎉 빌드 완료! dist/ 폴더를 Chrome Extension으로 로드할 수 있습니다.');
