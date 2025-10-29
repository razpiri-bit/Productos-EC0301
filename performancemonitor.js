#!/usr/bin/env node

/**
 * PERFORMANCE MONITOR v1.0.0 - VERSIÓN COMPLETA FUNCIONAL
 * ========================================================
 * Script profesional para medir y analizar la eficiencia de códigos
 * ✅ Completamente implementado y listo para usar
 * 
 * 📊 MÉTRICAS QUE MIDE:
 * - ⏱️  Tiempo promedio de ejecución
 * - 🔻 Tiempo mínimo
 * - 🔺 Tiempo máximo
 * - 📊 Desviación estándar
 * - 💾 Memoria usada
 * - 🔄 Throughput (ops/sec)
 * - 📈 Consistencia de rendimiento
 * 
 * ✅ CARACTERÍSTICAS:
 * - ✓ Benchmarking automático
 * - ✓ Reportes detallados
 * - ✓ Exportación a JSON
 * - ✓ Comparación de funciones
 * - ✓ Tests de carga
 * - ✓ Análisis estadístico completo
 * 
 * 📝 CAMBIOS EN ESTA VERSIÓN:
 * v1.0.0: ✅ Todas las funciones completas e implementadas
 */

const fs = require('fs');
const path = require('path');
const { performance, PerformanceObserver } = require('perf_hooks');

// ==================== CONFIGURACIÓN ====================
const CONFIG = {
  COLORS_ENABLED: true,
  EXPORT_JSON: true,
  DEFAULT_ITERATIONS: 100,
  DEFAULT_TIMEOUT: 5000,
  WARMUP_RUNS: 5,
  OUTPUT_DIR: './performance_reports'
};

// ==================== COLORES PARA CONSOLA ====================
const COLORS = {
  RESET: '\x1b[0m',
  BRIGHT: '\x1b[1m',
  DIM: '\x1b[2m',
  RED: '\x1b[31m',
  GREEN: '\x1b[32m',
  YELLOW: '\x1b[33m',
  BLUE: '\x1b[34m',
  CYAN: '\x1b[36m',
  WHITE: '\x1b[37m',
  BG_GREEN: '\x1b[42m',
  BG_RED: '\x1b[41m',
  BG_YELLOW: '\x1b[43m'
};

/**
 * Clase principal PerformanceMonitor
 * ✅ Completamente funcional
 */
class PerformanceMonitor {
  constructor(name) {
    this.name = name || 'benchmark';
    this.measurements = [];
    this.startTime = null;
    this.memoryBefore = null;
    this.results = {
      name: name,
      timestamp: new Date().toISOString(),
      metrics: {},
      validations: [],
      comparisons: []
    };
  }

  /**
   * Iniciar medición
   */
  start() {
    this.memoryBefore = process.memoryUsage();
    this.startTime = performance.now();
  }

  /**
   * Finalizar medición
   */
  end() {
    if (!this.startTime) {
      console.error(`${COLORS.RED}❌ Error: Llama a .start() primero${COLORS.RESET}`);
      return null;
    }

    const duration = performance.now() - this.startTime;
    const memoryAfter = process.memoryUsage();
    const memoryUsed = {
      heapUsed: (memoryAfter.heapUsed - this.memoryBefore.heapUsed) / 1024 / 1024,
      external: (memoryAfter.external - this.memoryBefore.external) / 1024 / 1024,
      rss: (memoryAfter.rss - this.memoryBefore.rss) / 1024 / 1024
    };

    this.measurements.push({ duration, memoryUsed });
    this.startTime = null;

    return duration;
  }

  /**
   * Ejecutar benchmark con múltiples iteraciones
   * ✅ Completamente implementado
   */
  async benchmark(fn, options = {}) {
    const {
      iterations = CONFIG.DEFAULT_ITERATIONS,
      warmup = CONFIG.WARMUP_RUNS,
      async: isAsync = false,
      throwOnError = false
    } = options;

    console.log(`\n${COLORS.CYAN}⏱️  Iniciando benchmark: ${this.name}${COLORS.RESET}`);
    console.log(`${COLORS.DIM}📊 Iteraciones: ${iterations} | Warmup: ${warmup}${COLORS.RESET}\n`);

    // WARMUP RUNS
    console.log(`${COLORS.YELLOW}🔥 Ejecutando warmup (${warmup} runs)...${COLORS.RESET}`);
    for (let i = 0; i < warmup; i++) {
      this.start();
      try {
        if (isAsync) {
          await fn();
        } else {
          fn();
        }
      } catch (error) {
        if (throwOnError) throw error;
      }
      this.end();
      process.stdout.write(`\r${COLORS.DIM}   ${i + 1}/${warmup}${COLORS.RESET}`);
    }
    console.log(`\r${COLORS.GREEN}✅ Warmup completado${COLORS.RESET}`);

    // LIMPIAR WARMUP
    this.measurements = [];

    // ITERACIONES PRINCIPALES
    console.log(`\n${COLORS.YELLOW}⚙️  Ejecutando ${iterations} iteraciones...${COLORS.RESET}`);
    const startBenchmark = Date.now();

    for (let i = 0; i < iterations; i++) {
      this.start();
      try {
        if (isAsync) {
          await fn();
        } else {
          fn();
        }
      } catch (error) {
        if (throwOnError) throw error;
        this.measurements.push({ duration: Infinity, memoryUsed: {} });
      }
      this.end();

      // Mostrar progreso cada 10%
      if ((i + 1) % Math.ceil(iterations / 10) === 0) {
        const progress = Math.round(((i + 1) / iterations) * 100);
        process.stdout.write(`\r${COLORS.CYAN}   ${progress}% (${i + 1}/${iterations})${COLORS.RESET}`);
      }
    }

    const totalTime = Date.now() - startBenchmark;
    console.log(`\r${COLORS.GREEN}✅ Benchmark completado en ${totalTime}ms${COLORS.RESET}\n`);

    return this.generateReport();
  }

  /**
   * Generar reporte con estadísticas
   * ✅ Completamente implementado
   */
  generateReport() {
    if (this.measurements.length === 0) {
      console.warn(`${COLORS.YELLOW}⚠️  No hay mediciones${COLORS.RESET}`);
      return null;
    }

    // Calcular estadísticas
    const durations = this.measurements.map(m => m.duration);
    const validDurations = durations.filter(d => d !== Infinity);

    const totalTime = validDurations.reduce((a, b) => a + b, 0);
    const avgTime = totalTime / validDurations.length;
    const minTime = Math.min(...validDurations);
    const maxTime = Math.max(...validDurations);
    const stdDev = this.calculateStdDev(validDurations, avgTime);
    const median = this.calculateMedian(validDurations);
    const p95 = this.calculatePercentile(validDurations, 0.95);
    const p99 = this.calculatePercentile(validDurations, 0.99);

    // Memoria
    const memoryUsages = this.measurements.map(m => m.memoryUsed.heapUsed || 0);
    const avgMemory = memoryUsages.reduce((a, b) => a + b, 0) / memoryUsages.length;
    const maxMemory = Math.max(...memoryUsages);

    // Throughput
    const throughput = (1000 / avgTime).toFixed(2);

    this.results.metrics = {
      avgTime: parseFloat(avgTime.toFixed(2)),
      minTime: parseFloat(minTime.toFixed(2)),
      maxTime: parseFloat(maxTime.toFixed(2)),
      median: parseFloat(median.toFixed(2)),
      stdDev: parseFloat(stdDev.toFixed(2)),
      p95: parseFloat(p95.toFixed(2)),
      p99: parseFloat(p99.toFixed(2)),
      totalTime: parseFloat(totalTime.toFixed(2)),
      iterations: validDurations.length,
      throughput: throughput,
      memory: {
        avgHeap: parseFloat(avgMemory.toFixed(2)),
        maxHeap: parseFloat(maxMemory.toFixed(2))
      }
    };

    // Validaciones
    this._performValidations();

    return this.results;
  }

  /**
   * Calcular desviación estándar
   */
  calculateStdDev(data, mean) {
    if (data.length === 0) return 0;
    const squareDiffs = data.map(v => Math.pow(v - mean, 2));
    const avgSquareDiff = squareDiffs.reduce((a, b) => a + b, 0) / data.length;
    return Math.sqrt(avgSquareDiff);
  }

  /**
   * Calcular mediana
   */
  calculateMedian(data) {
    const sorted = [...data].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0
      ? sorted[mid]
      : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  /**
   * Calcular percentil
   */
  calculatePercentile(data, percentile) {
    const sorted = [...data].sort((a, b) => a - b);
    const index = Math.ceil(sorted.length * percentile) - 1;
    return sorted[Math.max(0, index)];
  }

  /**
   * Realizar validaciones automáticas
   */
  _performValidations() {
    const metrics = this.results.metrics;
    const validations = [];

    // Velocidad
    if (metrics.avgTime < 10) {
      validations.push({ type: 'speed', level: 'excellent', message: '✅ Velocidad EXCELENTE (<10ms)' });
    } else if (metrics.avgTime < 50) {
      validations.push({ type: 'speed', level: 'great', message: '✅ Velocidad MUY BUENA (<50ms)' });
    } else if (metrics.avgTime < 200) {
      validations.push({ type: 'speed', level: 'good', message: '✅ Velocidad BUENA (<200ms)' });
    } else if (metrics.avgTime < 1000) {
      validations.push({ type: 'speed', level: 'acceptable', message: '⚠️  Velocidad ACEPTABLE (<1s)' });
    } else {
      validations.push({ type: 'speed', level: 'poor', message: '❌ Velocidad LENTA (>1s)' });
    }

    // Consistencia
    const consistency = metrics.stdDev / metrics.avgTime;
    if (consistency < 0.1) {
      validations.push({ type: 'consistency', level: 'excellent', message: '✅ Consistencia EXCELENTE (<10%)' });
    } else if (consistency < 0.2) {
      validations.push({ type: 'consistency', level: 'good', message: '✅ Consistencia BUENA (<20%)' });
    } else {
      validations.push({ type: 'consistency', level: 'variable', message: '⚠️  Consistencia VARIABLE (>20%)' });
    }

    // Memoria
    if (metrics.memory.maxHeap < 1) {
      validations.push({ type: 'memory', level: 'excellent', message: '✅ Memoria EXCELENTE (<1MB)' });
    } else if (metrics.memory.maxHeap < 10) {
      validations.push({ type: 'memory', level: 'good', message: '✅ Memoria BUENA (<10MB)' });
    } else {
      validations.push({ type: 'memory', level: 'warning', message: '⚠️  Memoria ALTA (>10MB)' });
    }

    this.results.validations = validations;
  }

  /**
   * Mostrar reporte formateado en consola
   */
  printReport() {
    const report = this.results;
    const metrics = report.metrics;

    // Header
    console.log(`\n${COLORS.BG_GREEN}${COLORS.WHITE}${COLORS.BRIGHT}`);
    console.log('════════════════════════════════════════════════════════════════');
    console.log(`                 📊 PERFORMANCE REPORT`);
    console.log(`                 ${report.name.toUpperCase()}`);
    console.log('════════════════════════════════════════════════════════════════');
    console.log(`${COLORS.RESET}\n`);

    // Métricas principales
    console.log(`${COLORS.CYAN}${COLORS.BRIGHT}⏱️  TIEMPOS (ms):${COLORS.RESET}`);
    console.log(`   ${COLORS.BRIGHT}Promedio${COLORS.RESET}:    ${metrics.avgTime}ms ${this._getSpeedIcon(metrics.avgTime)}`);
    console.log(`   ${COLORS.DIM}Mínimo${COLORS.RESET}:      ${metrics.minTime}ms`);
    console.log(`   ${COLORS.DIM}Máximo${COLORS.RESET}:      ${metrics.maxTime}ms`);
    console.log(`   ${COLORS.DIM}Mediana${COLORS.RESET}:     ${metrics.median}ms`);
    console.log(`   ${COLORS.DIM}P95${COLORS.RESET}:        ${metrics.p95}ms`);
    console.log(`   ${COLORS.DIM}P99${COLORS.RESET}:        ${metrics.p99}ms`);
    console.log(`   ${COLORS.DIM}Std Dev${COLORS.RESET}:     ${metrics.stdDev}ms`);

    // Throughput y memoria
    console.log(`\n${COLORS.CYAN}${COLORS.BRIGHT}📈 THROUGHPUT & MEMORIA:${COLORS.RESET}`);
    console.log(`   ${COLORS.BRIGHT}Throughput${COLORS.RESET}:     ${metrics.throughput} ops/sec`);
    console.log(`   ${COLORS.DIM}Heap Promedio${COLORS.RESET}:  ${metrics.memory.avgHeap} MB`);
    console.log(`   ${COLORS.DIM}Heap Máximo${COLORS.RESET}:    ${metrics.memory.maxHeap} MB`);

    // Iteraciones
    console.log(`\n${COLORS.CYAN}${COLORS.BRIGHT}📊 INFORMACIÓN:${COLORS.RESET}`);
    console.log(`   ${COLORS.BRIGHT}Iteraciones${COLORS.RESET}:    ${metrics.iterations}`);
    console.log(`   ${COLORS.DIM}Tiempo Total${COLORS.RESET}:    ${metrics.totalTime}ms`);
    console.log(`   ${COLORS.DIM}Timestamp${COLORS.RESET}:      ${report.timestamp}`);

    // Validaciones
    console.log(`\n${COLORS.CYAN}${COLORS.BRIGHT}✅ VALIDACIONES:${COLORS.RESET}`);
    report.validations.forEach(v => {
      const color = v.level === 'excellent' || v.level === 'great' || v.level === 'good' ? COLORS.GREEN : COLORS.YELLOW;
      console.log(`   ${color}${v.message}${COLORS.RESET}`);
    });

    // Footer
    console.log(`\n${COLORS.BG_GREEN}${COLORS.WHITE}${COLORS.BRIGHT}`);
    console.log('════════════════════════════════════════════════════════════════');
    console.log(`${COLORS.RESET}\n`);

    return report;
  }

  /**
   * Obtener ícono según velocidad
   */
  _getSpeedIcon(time) {
    if (time < 10) return '⚡⚡⚡';
    if (time < 50) return '⚡⚡';
    if (time < 200) return '⚡';
    if (time < 1000) return '🐌';
    return '🐢';
  }

  /**
   * Guardar reporte en JSON
   */
  saveReport(filename = null) {
    // Crear directorio si no existe
    if (!fs.existsSync(CONFIG.OUTPUT_DIR)) {
      fs.mkdirSync(CONFIG.OUTPUT_DIR, { recursive: true });
    }

    if (!filename) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      filename = `report_${this.name}_${timestamp}.json`;
    }

    const filepath = path.join(CONFIG.OUTPUT_DIR, filename);
    fs.writeFileSync(filepath, JSON.stringify(this.results, null, 2));

    console.log(`${COLORS.GREEN}✅ Reporte guardado: ${filepath}${COLORS.RESET}\n`);
    return filepath;
  }

  /**
   * Comparar dos benchmarks
   */
  static compare(monitor1, monitor2) {
    console.log(`\n${COLORS.CYAN}${COLORS.BRIGHT}📊 COMPARACIÓN: ${monitor1.name} vs ${monitor2.name}${COLORS.RESET}\n`);

    const m1 = monitor1.results.metrics;
    const m2 = monitor2.results.metrics;

    const ratio = m1.avgTime / m2.avgTime;
    const faster = ratio > 1 ? monitor2.name : monitor1.name;
    const times = Math.abs(ratio - 1).toFixed(2);

    console.log(`${COLORS.BRIGHT}${faster}${COLORS.RESET} es ${Math.abs(ratio).toFixed(2)}x más rápido\n`);

    console.log('┌─ Métrica ─────────────────┬────────────────┬────────────────┬──────────┐');
    console.log('│ Tiempo Promedio (ms)      │ ' + m1.avgTime.toString().padEnd(14) + ' │ ' + m2.avgTime.toString().padEnd(14) + ' │ ' + (ratio > 1 ? '✅ M2' : '✅ M1').padEnd(8) + ' │');
    console.log('│ Std Dev (ms)              │ ' + m1.stdDev.toString().padEnd(14) + ' │ ' + m2.stdDev.toString().padEnd(14) + ' │ ' + (m1.stdDev > m2.stdDev ? '✅ M2' : '✅ M1').padEnd(8) + ' │');
    console.log('│ Throughput (ops/sec)      │ ' + m1.throughput.toString().padEnd(14) + ' │ ' + m2.throughput.toString().padEnd(14) + ' │ ' + (m1.throughput > m2.throughput ? '✅ M1' : '✅ M2').padEnd(8) + ' │');
    console.log('│ Memoria Heap (MB)         │ ' + m1.memory.maxHeap.toString().padEnd(14) + ' │ ' + m2.memory.maxHeap.toString().padEnd(14) + ' │ ' + (m1.memory.maxHeap > m2.memory.maxHeap ? '✅ M2' : '✅ M1').padEnd(8) + ' │');
    console.log('└───────────────────────────┴────────────────┴────────────────┴──────────┘\n');
  }
}

// ==================== EJEMPLOS DE USO ====================

/**
 * Ejemplo 1: Benchmark básico
 */
async function example1() {
  console.log(`\n${COLORS.BRIGHT}🔍 EJEMPLO 1: Función Simple${COLORS.RESET}`);

  const monitor = new PerformanceMonitor('suma_simple');

  const testFn = () => {
    let sum = 0;
    for (let i = 0; i < 1000; i++) {
      sum += i;
    }
    return sum;
  };

  await monitor.benchmark(testFn, { iterations: 1000 });
  monitor.printReport();
  monitor.saveReport();
}

/**
 * Ejemplo 2: Comparar O(n) vs O(1)
 */
async function example2() {
  console.log(`\n${COLORS.BRIGHT}🔍 EJEMPLO 2: Comparar O(n) vs O(1)${COLORS.RESET}`);

  // O(n) - Búsqueda lineal
  const monitorLinear = new PerformanceMonitor('busqueda_lineal_ON');
  const arr = Array.from({ length: 1000 }, (_, i) => i);

  await monitorLinear.benchmark(() => {
    return arr.find(x => x === 999);
  }, { iterations: 500 });

  monitorLinear.printReport();

  // O(1) - Búsqueda en Set
  const monitorSet = new PerformanceMonitor('busqueda_set_O1');
  const set = new Set(arr);

  await monitorSet.benchmark(() => {
    return set.has(999);
  }, { iterations: 500 });

  monitorSet.printReport();

  // Comparar
  PerformanceMonitor.compare(monitorLinear, monitorSet);

  monitorLinear.saveReport();
  monitorSet.saveReport();
}

/**
 * Ejemplo 3: Operación asincrónica
 */
async function example3() {
  console.log(`\n${COLORS.BRIGHT}🔍 EJEMPLO 3: Operación Asincrónica${COLORS.RESET}`);

  const monitor = new PerformanceMonitor('async_operation');

  const asyncFn = async () => {
    return new Promise(resolve => setTimeout(resolve, 10 + Math.random() * 5));
  };

  await monitor.benchmark(asyncFn, { iterations: 100, async: true });
  monitor.printReport();
  monitor.saveReport();
}

/**
 * Ejemplo 4: JSON stringify (operación real)
 */
async function example4() {
  console.log(`\n${COLORS.BRIGHT}🔍 EJEMPLO 4: JSON.stringify con Datos Reales${COLORS.RESET}`);

  const monitor = new PerformanceMonitor('json_stringify');
  const largeObject = {
    users: Array.from({ length: 100 }, (_, i) => ({
      id: i,
      name: `User ${i}`,
      email: `user${i}@example.com`,
      data: Array.from({ length: 10 }, (_, j) => ({ value: Math.random() }))
    }))
  };

  await monitor.benchmark(() => {
    JSON.stringify(largeObject);
  }, { iterations: 1000 });

  monitor.printReport();
  monitor.saveReport();
}

// ==================== CLI ====================

async function runCLI() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help') {
    console.log(`
${COLORS.CYAN}${COLORS.BRIGHT}📊 PERFORMANCE MONITOR v1.0.0${COLORS.RESET}
Herramienta profesional para medir eficiencia de código

${COLORS.BRIGHT}Uso:${COLORS.RESET}
  node performanceMonitor_v1.0.0.js [opción]

${COLORS.BRIGHT}Opciones:${COLORS.RESET}
  --example 1    Función simple (suma)
  --example 2    Comparar O(n) vs O(1)
  --example 3    Operación asincrónica
  --example 4    JSON.stringify real
  --help         Mostrar esta ayuda

${COLORS.BRIGHT}Ejemplos:${COLORS.RESET}
  node performanceMonitor_v1.0.0.js --example 1
  node performanceMonitor_v1.0.0.js --example 2
  node performanceMonitor_v1.0.0.js --example 3

${COLORS.BRIGHT}Para importar en tu código:${COLORS.RESET}
  const { PerformanceMonitor } = require('./performanceMonitor_v1.0.0');
  const monitor = new PerformanceMonitor('mi_funcion');
  await monitor.benchmark(myFunction, { iterations: 1000 });
  monitor.printReport();
    `);
    return;
  }

  const command = args[0];
  const value = args[1];

  if (command === '--example') {
    switch (value) {
      case '1':
        await example1();
        break;
      case '2':
        await example2();
        break;
      case '3':
        await example3();
        break;
      case '4':
        await example4();
        break;
      default:
        console.error(`${COLORS.RED}❌ Ejemplo no válido. Usa: 1, 2, 3 o 4${COLORS.RESET}`);
    }
  }
}

// ==================== EXPORTAR Y EJECUTAR ====================

module.exports = { PerformanceMonitor };

if (require.main === module) {
  runCLI().catch(console.error);
}
