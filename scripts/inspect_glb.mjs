import { chromium } from '@playwright/test';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Create an HTML page with Three.js and GLTFLoader to inspect the GLB
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
        <script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js"></script>
      </head>
      <body>
        <script>
          window.inspectGLB = async (url) => {
            return new Promise((resolve) => {
              const loader = new THREE.GLTFLoader();
              loader.load(url, (gltf) => {
                const root = gltf.scene;
                const box = new THREE.Box3().setFromObject(root);
                
                // Try to find back panel vs shelves to guess front direction
                let backZ = 0;
                let frontZ = 0;
                let backX = 0;
                let frontX = 0;
                
                const parts = [];
                root.traverse(child => {
                  if (child.isMesh) {
                    const cBox = new THREE.Box3().setFromObject(child);
                    parts.push({
                      name: child.name,
                      minX: cBox.min.x, maxX: cBox.max.x,
                      minZ: cBox.min.z, maxZ: cBox.max.z
                    });
                  }
                });
                
                resolve({
                  box: { min: box.min, max: box.max },
                  parts: parts
                });
              });
            });
          };
        </script>
      </body>
    </html>
  `;

  await page.setContent(html);
  
  // We need to serve the public folder to access the GLB, or load it via the frontend server.
  // The frontend runs on http://localhost:5173
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
  
  // Inject the script into the frontend page directly since it has three.js
  const result = await page.evaluate(async () => {
    return new Promise(async (resolve) => {
      // Find the Endcap GLB URL
      const endcapModelId = 'RF-PRD-0009'; // from audit
      
      try {
        const loader = new window.THREE.GLTFLoader();
        loader.load('/models/RACKS_c5dafbfe.glb', (gltf) => {
          const root = gltf.scene;
          const box = new window.THREE.Box3().setFromObject(root);
          
          const parts = [];
          root.traverse(child => {
            if (child.isMesh) {
              const cBox = new window.THREE.Box3().setFromObject(child);
              parts.push({
                name: child.name,
                minX: cBox.min.x, maxX: cBox.max.x,
                minZ: cBox.min.z, maxZ: cBox.max.z
              });
            }
          });
          
          resolve({
            box: { min: box.min, max: box.max },
            parts: parts.slice(0, 10) // first 10 parts
          });
        });
      } catch (e) {
        resolve({ error: e.message });
      }
    });
  });

  console.log(JSON.stringify(result, null, 2));
  await browser.close();
}
main();
