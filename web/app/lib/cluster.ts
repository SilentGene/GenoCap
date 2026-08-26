import type { ClusterNode, FeatureRow } from './types';

interface WorkingCluster { node: ClusterNode; members: number[]; }

export function weightedJaccard(a: number[], b: number[]): number {
  let minimum = 0;
  let maximum = 0;
  for (let index = 0; index < a.length; index += 1) {
    minimum += Math.min(a[index] ?? 0, b[index] ?? 0);
    maximum += Math.max(a[index] ?? 0, b[index] ?? 0);
  }
  return maximum === 0 ? 0 : 1 - minimum / maximum;
}

export function clusterGenomes(genomes: string[], rows: FeatureRow[]): { order: string[]; root?: ClusterNode } {
  if (genomes.length === 0) return { order: [] };
  if (genomes.length === 1) {
    const root = leaf(genomes[0], 0);
    return { order: [...genomes], root };
  }
  const vectors = genomes.map((genome) => rows.map((row) => row.cells[genome].value));
  const distances = vectors.map((vector, index) => vectors.map((other, otherIndex) => index === otherIndex ? 0 : weightedJaccard(vector, other)));
  let clusters: WorkingCluster[] = genomes.map((genome, index) => ({ node: leaf(genome, index), members: [index] }));

  while (clusters.length > 1) {
    let bestI = 0;
    let bestJ = 1;
    let bestDistance = Number.POSITIVE_INFINITY;
    let bestKey = '';
    for (let i = 0; i < clusters.length; i += 1) {
      for (let j = i + 1; j < clusters.length; j += 1) {
        const distance = averageDistance(clusters[i].members, clusters[j].members, distances);
        const key = `${String(Math.min(...clusters[i].members)).padStart(6, '0')}:${String(Math.min(...clusters[j].members)).padStart(6, '0')}`;
        if (distance < bestDistance - 1e-12 || (Math.abs(distance - bestDistance) <= 1e-12 && key < bestKey)) {
          bestI = i; bestJ = j; bestDistance = distance; bestKey = key;
        }
      }
    }
    const first = clusters[bestI];
    const second = clusters[bestJ];
    const [left, right] = Math.min(...first.members) <= Math.min(...second.members) ? [first, second] : [second, first];
    const members = [...left.members, ...right.members];
    const merged: WorkingCluster = {
      members,
      node: { id: `cluster-${members.join('-')}`, height: bestDistance, members, left: left.node, right: right.node },
    };
    clusters = clusters.filter((_, index) => index !== bestI && index !== bestJ);
    clusters.push(merged);
  }

  const root = clusters[0].node;
  const order: string[] = [];
  collectLeaves(root, order);
  return { order, root };
}

function leaf(genome: string, index: number): ClusterNode {
  return { id: `leaf-${index}`, height: 0, members: [index], genome };
}

function averageDistance(a: number[], b: number[], distances: number[][]): number {
  let total = 0;
  for (const left of a) for (const right of b) total += distances[left][right];
  return total / (a.length * b.length);
}

function collectLeaves(node: ClusterNode, order: string[]): void {
  if (node.genome) { order.push(node.genome); return; }
  if (node.left) collectLeaves(node.left, order);
  if (node.right) collectLeaves(node.right, order);
}
