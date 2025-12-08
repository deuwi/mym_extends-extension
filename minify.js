// minify.js - Script de minification pour les fichiers JavaScript
const fs = require('fs');
const path = require('path');
const { minify } = require('terser');

async function minifyFile(inputPath, outputPath) {
  try {
    const code = fs.readFileSync(inputPath, 'utf8');
    const result = await minify(code, {
      compress: {
        dead_code: true,
        drop_console: false, // Garder console.log pour debug
        drop_debugger: true,
        unused: true,
      },
      mangle: {
        toplevel: false, // Ne pas renommer les variables globales
        reserved: ['chrome', 'browser', 'window', 'document'], // Protéger les APIs
      },
      format: {
        comments: false, // Supprimer les commentaires
      },
    });

    if (result.error) {
      console.error(`❌ Error minifying ${inputPath}:`, result.error);
      // En cas d'erreur, copier le fichier original
      fs.copyFileSync(inputPath, outputPath);
      return false;
    }

    fs.writeFileSync(outputPath, result.code, 'utf8');
    const originalSize = code.length;
    const minifiedSize = result.code.length;
    const reduction = ((1 - minifiedSize / originalSize) * 100).toFixed(1);
    console.log(`✅ ${path.basename(inputPath)}: ${originalSize} → ${minifiedSize} bytes (-${reduction}%)`);
    return true;
  } catch (error) {
    console.error(`❌ Error processing ${inputPath}:`, error.message);
    // En cas d'erreur, copier le fichier original
    fs.copyFileSync(inputPath, outputPath);
    return false;
  }
}

async function minifyDirectory(inputDir, outputDir, extensions = ['.js']) {
  const files = fs.readdirSync(inputDir);

  for (const file of files) {
    const inputPath = path.join(inputDir, file);
    const outputPath = path.join(outputDir, file);
    const stat = fs.statSync(inputPath);

    if (stat.isDirectory()) {
      if (!fs.existsSync(outputPath)) {
        fs.mkdirSync(outputPath, { recursive: true });
      }
      await minifyDirectory(inputPath, outputPath, extensions);
    } else if (extensions.includes(path.extname(file))) {
      await minifyFile(inputPath, outputPath);
    }
  }
}

// Fonction principale
async function main() {
  const buildDir = process.argv[2];
  if (!buildDir) {
    console.error('Usage: node minify.js <build-directory>');
    process.exit(1);
  }

  if (!fs.existsSync(buildDir)) {
    console.error(`❌ Build directory not found: ${buildDir}`);
    process.exit(1);
  }

  console.log(`🔧 Minifying JavaScript files in ${buildDir}...`);

  // Minifier tous les fichiers .js à la racine du build
  const files = fs.readdirSync(buildDir);
  for (const file of files) {
    const filePath = path.join(buildDir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isFile() && path.extname(file) === '.js') {
      await minifyFile(filePath, filePath);
    }
  }

  // Minifier le dossier modules si présent
  const modulesDir = path.join(buildDir, 'modules');
  if (fs.existsSync(modulesDir)) {
    console.log('🔧 Minifying modules directory...');
    const moduleFiles = fs.readdirSync(modulesDir);
    for (const file of moduleFiles) {
      const filePath = path.join(modulesDir, file);
      if (fs.statSync(filePath).isFile() && path.extname(file) === '.js') {
        await minifyFile(filePath, filePath);
      }
    }
  }

  console.log('✅ Minification completed!');
}

main().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
