const fs = require('fs');
const files = ['energySaver.html', 'oceanCleaner.html', 'pollutionPatrol.html', 'recycleSorter.html', 'solarArchitect.html', 'treeTycoon.html', 'waterSaver.html', 'wildlifeProtector.html'];

const snippet = `
            const email = localStorage.getItem("userEmail");
            if (email && typeof score !== 'undefined' && score > 0) {
                fetch("http://localhost:4000/api/users/addPoints", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ email: email, points_to_add: score })
                }).catch(e => console.log(e));
            }
`;

files.forEach(f => {
  const path = '../frontend/public/games/' + f;
  let content = fs.readFileSync(path, 'utf8');
  
  if (f === 'wildlifeProtector.html') {
    content = content.replace(/if\s*\(habitatLoss\s*>=\s*100\)\s*\{\s*active\s*=\s*false;/, 'if (habitatLoss >= 100) { active = false;' + snippet);
  } else if (f === 'solarArchitect.html' || f === 'treeTycoon.html') {
    content = content.replace(/active\s*=\s*false;\s*overlay\.style\.(visibility|display)\s*=\s*['\"]\w+['\"];/, 'active = false;' + snippet + 'overlay.style.$1 = "visible";');
  } else {
    // Only replace the FIRST 'active = false;' (which is in gameOver in most games, except wildlifeProtector which we handled)
    // Wait, let's just replace 'active = false;' globally if there's only one inside a function, but let's be careful.
    // Replace the first 'active = false;' that appears after 'function gameOver()'
    content = content.replace(/(function\s+gameOver\(\)\s*\{[\s\S]*?active\s*=\s*false;)/, '$1' + snippet);
  }
  
  fs.writeFileSync(path, content);
  console.log('Patched ' + f);
});
