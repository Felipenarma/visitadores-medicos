"""Constantes de negocio compartidas entre routers."""

from datetime import datetime, timedelta

# Tope/meta de visitas médicas por visitador y día hábil (lunes a viernes).
# Se usa tanto para repartir la generación automática de visitas futuras
# como para medir cumplimiento en los dashboards y en Mike.
MAX_VISITS_PER_DAY = 7


def count_weekdays(start: datetime, end: datetime) -> int:
    """Cuenta días hábiles (lunes a viernes) en el rango [start, end)."""
    if end <= start:
        return 0
    days = 0
    d = start.date()
    end_d = end.date()
    while d < end_d:
        if d.weekday() < 5:  # 0=lunes ... 4=viernes
            days += 1
        d += timedelta(days=1)
    return days


# Montos de venta: el archivo de ventas trae precio al público CON IVA.
# Venta neta = monto / (1 + IVA_RATE).
IVA_RATE = 0.19

# Meta mensual de venta neta por visitador: crecer este % sobre la venta neta del mes anterior.
SALES_GROWTH_TARGET = 0.15


def to_net(amount) -> float:
    """Convierte un monto con IVA a neto (sin IVA)."""
    try:
        return float(amount or 0) / (1 + IVA_RATE)
    except (TypeError, ValueError):
        return 0.0
