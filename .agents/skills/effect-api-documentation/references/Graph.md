# `Graph`

Source: [Effect v4 `Graph` API](https://www.effect.website/docs/v4/api/effect/Graph). Examples assume `import { Graph } from "effect"`.

`Graph` models immutable directed or undirected nodes and edges, with utilities for construction, transformation, and traversal.

## API index

1. [Graph.Graph](#graphgraph)
2. [Graph.directed](#graphdirected)
3. [Graph.undirected](#graphundirected)
4. [Graph.addNode](#graphaddnode)
5. [Graph.addEdge](#graphaddedge)
6. [Graph.neighbors](#graphneighbors)
7. [Graph.mapNodes](#graphmapnodes)
8. [Graph.isAcyclic](#graphisacyclic)
9. [Graph.connectedComponents](#graphconnectedcomponents)
10. [Graph.dijkstra](#graphdijkstra)
11. [Graph.bfs](#graphbfs)
12. [Graph.topo](#graphtopo)
13. [Graph.getNode](#graphgetnode)
14. [Graph.hasEdge](#graphhasedge)

### Additional known APIs (not expanded)

`NodeIndex`, `EdgeIndex`, `Edge`, `Kind`, `MutableGraph`, `DirectedGraph`, `UndirectedGraph`, `MutableDirectedGraph`, `MutableUndirectedGraph`, `GraphError`, `isGraph`, `beginMutation`, `endMutation`, `mutate`, `getNode`, `hasNode`, `nodeCount`, `findNode`, `findNodes`, `findEdge`, `findEdges`, `updateNode`, `updateEdge`, `mapEdges`, `reverse`, `filterMapNodes`, `filterMapEdges`, `filterNodes`, `filterEdges`, `removeNode`, `removeEdge`, `getEdge`, `edgeCount`, `successors`, `predecessors`, `neighborsDirected`, `toGraphViz`, `toMermaid`, `isBipartite`, `stronglyConnectedComponents`, `floydWarshall`, `astar`, `bellmanFord`, `indices`, `values`, `entries`, `dfs`, `dfsPostOrder`, `externals`

### [Graph.Graph](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Graph.ts:148)

Represents an immutable directed or undirected graph whose nodes and edges carry data.

```ts
const graph: Graph.Graph<string, number> = Graph.directed();
```

### [Graph.directed](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Graph.ts:396)

Creates a directed graph and can populate it inside one mutation callback.

```ts
const graph = Graph.directed<string, number>((mutable) => {
  const a = Graph.addNode(mutable, "A");
  const b = Graph.addNode(mutable, "B");
  Graph.addEdge(mutable, a, b, 1);
});
```

### [Graph.undirected](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Graph.ts:438)

Creates a graph where each edge connects both endpoints.

```ts
const graph = Graph.undirected<string, void>((mutable) => {
  const a = Graph.addNode(mutable, "A");
  const b = Graph.addNode(mutable, "B");
  Graph.addEdge(mutable, a, b, undefined);
});
```

### [Graph.addNode](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Graph.ts:623)

Adds node data to a mutable graph and returns its numeric index.

```ts
const graph = Graph.mutate(Graph.directed<string, never>(), (mutable) => {
  Graph.addNode(mutable, "root");
});
```

### [Graph.addEdge](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Graph.ts:1411)

Connects two existing node indexes with edge data.

```ts
const graph = Graph.directed<string, number>((mutable) => {
  const a = Graph.addNode(mutable, "A");
  const b = Graph.addNode(mutable, "B");
  Graph.addEdge(mutable, a, b, 3);
});
```

### [Graph.neighbors](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Graph.ts:1815)

Returns adjacent node indexes, following outgoing edges for directed graphs.

```ts
const graph = Graph.directed<string, void>((mutable) => {
  const a = Graph.addNode(mutable, "A");
  const b = Graph.addNode(mutable, "B");
  Graph.addEdge(mutable, a, b, undefined);
});
const next = Graph.neighbors(graph, 0);
```

### [Graph.mapNodes](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Graph.ts:1018)

Transforms every node value while preserving graph topology.

```ts
const labeled = Graph.mapNodes(Graph.directed<number, void>(), (value) => `node:${value}`);
```

### [Graph.isAcyclic](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Graph.ts:2658)

Checks whether a graph contains no cycles.

```ts
const graph = Graph.directed<string, void>();
const acyclic = Graph.isAcyclic(graph);
```

### [Graph.connectedComponents](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Graph.ts:2924)

Finds connected node groups in an undirected graph.

```ts
const graph = Graph.undirected<string, void>();
const components = Graph.connectedComponents(graph);
```

### [Graph.dijkstra](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Graph.ts:3207)

Finds a lowest-cost path using non-negative edge costs.

```ts
const result = Graph.dijkstra(graph, { source: 0, target: 1, cost: (weight) => weight });
```

### [Graph.bfs](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Graph.ts:4351)

Creates a breadth-first node walker from optional starting indexes.

```ts
const walker = Graph.bfs(graph, { start: [0] });
for (const node of Graph.values(walker)) console.log(node);
```

### [Graph.topo](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Graph.ts:4480)

Creates a topological walker for an acyclic directed graph.

```ts
const order = Graph.topo(graph);
for (const node of Graph.indices(order)) console.log(node);
```

### [Graph.getNode](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Graph.ts:665)

Safely retrieves node data as an `Option`.

```ts
const node = Graph.getNode(graph, 0);
```

### [Graph.hasEdge](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Graph.ts:1691)

Checks whether an edge exists between two node indexes.

```ts
const connected = Graph.hasEdge(graph, 0, 1);
```
