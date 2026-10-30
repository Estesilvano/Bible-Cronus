#!/usr/bin/env bash
set -e

echo "==========================================="
echo "📱 OpenCode Android APK Build Automation"
echo "==========================================="

echo "1. Compilando TypeScript..."
npm run build

echo "2. Sincronizando Assets com Capacitor Android..."
npx cap sync android

echo "3. Verificando ambiente Android Gradle..."
if [ -d "android" ]; then
  cd android
  if command -v ./gradlew &> /dev/null; then
    chmod +x gradlew
    echo "Construindo APK Debug..."
    ./gradlew assembleDebug || echo "Aviso: SDK do Android não configurado localmente; arquivos prontos para Android Studio/CI."
  fi
  cd ..
fi

echo "==========================================="
echo "✅ Projeto Android pronto para geração de APK!"
echo "   Abra a pasta 'android/' no Android Studio"
echo "   ou execute: cd android && ./gradlew assembleDebug"
echo "==========================================="
