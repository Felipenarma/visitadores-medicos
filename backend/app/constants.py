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
