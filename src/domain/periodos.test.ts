import { expect, test } from 'vitest';
import { sumarDias } from './dates';
import {
  INICIO_DE_LOS_TIEMPOS,
  cambiarDiaCierre,
  nombrePeriodo,
  periodoQueContiene,
  periodosEntre,
  ventanaPago,
} from './periodos';

const ult = [{ vigenteDesde: INICIO_DE_LOS_TIEMPOS, dia: 'ULTIMO' as const }];
const d15 = [{ vigenteDesde: INICIO_DE_LOS_TIEMPOS, dia: 15 }];
const d31 = [{ vigenteDesde: INICIO_DE_LOS_TIEMPOS, dia: 31 }];
const d30 = [{ vigenteDesde: INICIO_DE_LOS_TIEMPOS, dia: 30 }];
test('último día = mes calendario', () =>
  expect(periodoQueContiene(ult, '2026-10-27')).toEqual({ inicio: '2026-10-01', fin: '2026-10-31' }));
test('cierre 15', () =>
  expect(periodoQueContiene(d15, '2026-10-20')).toEqual({ inicio: '2026-10-16', fin: '2026-11-15' }));
test('cierre 31 en febrero bisiesto', () => {
  expect(periodoQueContiene(d31, '2028-02-10')).toEqual({ inicio: '2028-02-01', fin: '2028-02-29' });
  expect(periodoQueContiene(d31, '2028-03-15')).toEqual({ inicio: '2028-03-01', fin: '2028-03-31' });
});
test('cierre 30 cruzando febrero no bisiesto', () => {
  expect(periodoQueContiene(d30, '2027-03-01')).toEqual({ inicio: '2027-03-01', fin: '2027-03-30' });
  expect(periodoQueContiene(d30, '2027-03-31')).toEqual({ inicio: '2027-03-31', fin: '2027-04-30' });
});
test('fecha muy vieja usa la regla vigente en ese momento', () => {
  const r = cambiarDiaCierre(ult, 15, '2026-10-20');
  expect(r.at(-1)).toEqual({ vigenteDesde: '2026-11-01', dia: 15 });
  expect(periodoQueContiene(r, '2024-03-10')).toEqual({ inicio: '2024-03-01', fin: '2024-03-31' });
  expect(periodoQueContiene(r, '2026-10-25')).toEqual({ inicio: '2026-10-01', fin: '2026-10-31' }); // el abierto no cambia
  expect(periodoQueContiene(r, '2026-11-05')).toEqual({ inicio: '2026-11-01', fin: '2026-11-15' }); // transición
  expect(periodoQueContiene(r, '2026-11-20')).toEqual({ inicio: '2026-11-16', fin: '2026-12-15' });
});
test('cambiar dos veces antes de que arranque reemplaza la regla futura', () => {
  const r = cambiarDiaCierre(cambiarDiaCierre(ult, 15, '2026-10-20'), 10, '2026-10-21');
  expect(r).toHaveLength(2);
  expect(r[1]).toEqual({ vigenteDesde: '2026-11-01', dia: 10 });
});
test('ventana de pago del mes siguiente, acotada', () => {
  expect(ventanaPago('2026-09-30', 21, 31)).toEqual({ desde: '2026-10-21', hasta: '2026-10-31' });
  expect(ventanaPago('2026-10-31', 21, 31)).toEqual({ desde: '2026-11-21', hasta: '2026-11-30' });
  expect(ventanaPago('2027-01-31', 29, 31)).toEqual({ desde: '2027-02-28', hasta: '2027-02-28' });
});
test('periodosEntre lista del más nuevo al más viejo', () =>
  expect(periodosEntre(ult, '2026-08-15', '2026-10-27').map(p => p.fin))
    .toEqual(['2026-10-31', '2026-09-30', '2026-08-31']));
test('nombrePeriodo: mismo mes, meses distintos y cruce de año', () => {
  expect(nombrePeriodo({ inicio: '2026-10-01', fin: '2026-10-31' })).toBe('1 – 31 oct');
  expect(nombrePeriodo({ inicio: '2026-10-16', fin: '2026-11-15' })).toBe('16 oct – 15 nov');
  expect(nombrePeriodo({ inicio: '2026-12-16', fin: '2027-01-15' })).toBe('16 dic – 15 ene');
});

test('fecha anterior a la primera regla: el período la contiene', () => {
  const r = [{ vigenteDesde: '2020-01-01', dia: 15 }];
  expect(periodoQueContiene(r, '2019-05-05')).toEqual({ inicio: '2019-04-16', fin: '2019-05-15' });
});
test('periodosEntre con la primera regla posterior al rango termina y es contiguo', () => {
  const r = [{ vigenteDesde: '2020-01-01', dia: 15 }];
  const ps = periodosEntre(r, '2019-06-01', '2020-05-10');
  expect(ps.length).toBeGreaterThan(1);
  for (let i = 0; i < ps.length - 1; i++) expect(ps[i + 1].fin).toBe(sumarDias(ps[i].inicio, -1));
  expect(ps[0].inicio <= '2020-05-10' && '2020-05-10' <= ps[0].fin).toBe(true);
  const ultimo = ps[ps.length - 1];
  expect(ultimo.inicio <= '2019-06-01' && '2019-06-01' <= ultimo.fin).toBe(true);
});
test('cambiarDiaCierre con hoy anterior a todas las reglas no falla', () => {
  const r = cambiarDiaCierre([{ vigenteDesde: '2020-01-01', dia: 15 }], 10, '2019-05-05');
  expect(r.at(-1)).toEqual({ vigenteDesde: '2019-05-16', dia: 10 });
  expect(periodoQueContiene(r, '2019-05-05')).toEqual({ inicio: '2019-04-16', fin: '2019-05-15' });
});
