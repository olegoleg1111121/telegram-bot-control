"""Embedded telemetry for aiogram. Importing this package performs no I/O."""

__version__ = "0.6.1"


def start(**kwargs):
    """Lazily import aiogram integration, keeping the stdio reader lightweight."""
    from .monitor import start as attach

    # Keep caller location: the wrapper must not become the detected entrypoint.
    if kwargs.get("entrypoint") is None:
        import inspect

        frame = inspect.currentframe()
        try:
            filename = frame.f_back.f_globals.get("__file__") if frame and frame.f_back else None
            if not filename:
                raise ValueError("Set entrypoint explicitly when running interactively")
            kwargs["entrypoint"] = filename
        finally:
            del frame
    return attach(**kwargs)
