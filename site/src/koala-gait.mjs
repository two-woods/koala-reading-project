export const KOALA_GAIT = Object.freeze({ legStart: .20, legEnd: .42, legPivot: .37, armStart: .51, armEnd: .72, armPivot: 1.0 });

// 腿从真实髋部以下摆动，躯干与衣身保持稳定；身体和所有装扮共用同一实现。
export function applyKoalaGait(root, uniforms) {
  const p = KOALA_GAIT;
  const rotateCode = `
    float legWeight = 1.0 - smoothstep(${p.legStart.toFixed(3)}, ${p.legEnd.toFixed(3)}, position.y);
    float armWeight = smoothstep(${p.armStart.toFixed(3)}, ${p.armEnd.toFixed(3)}, abs(position.x)) * smoothstep(0.47, 0.67, position.y) * (1.0 - smoothstep(0.96, 1.09, position.y));
    float side = position.x < 0.0 ? -1.0 : 1.0;
    float angle = sin(gaitTime * 9.0) * side * gaitAmount * (legWeight * 0.43 - armWeight * 0.28);
    float c = cos(angle), s = sin(angle);
    mat3 gaitRotation = mat3(1.0,0.0,0.0, 0.0,c,s, 0.0,-s,c);
  `;
  root.traverse((mesh) => {
    if (!mesh.isMesh) return;
    mesh.updateMatrix(); mesh.geometry.applyMatrix4(mesh.matrix);
    mesh.position.set(0, 0, 0); mesh.rotation.set(0, 0, 0); mesh.scale.set(1, 1, 1); mesh.updateMatrix();
    for (const material of [mesh.material].flat()) {
      material.onBeforeCompile = (shader) => {
        shader.uniforms.gaitTime = uniforms.time; shader.uniforms.gaitAmount = uniforms.amount;
        shader.vertexShader = 'uniform float gaitTime; uniform float gaitAmount;\n' + shader.vertexShader;
        shader.vertexShader = shader.vertexShader.replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\n' + rotateCode + '\nobjectNormal = gaitRotation * objectNormal;');
        shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>\nfloat pivotY = mix(${p.legPivot.toFixed(3)},${p.armPivot.toFixed(3)},step(legWeight,armWeight));\ntransformed = gaitRotation * (transformed - vec3(0.0,pivotY,0.0)) + vec3(0.0,pivotY,0.0);`);
      };
      material.customProgramCacheKey = () => 'koala-procedural-gait-v2';
    }
  });
}
