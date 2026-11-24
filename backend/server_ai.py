
"""
Start the MUAWIN API with AI and teacher setup services.
"""

from . import server as _server
from . import muawin_ai
from . import muawin_services
from . import course_setup_automation
from . import class_mode_api

muawin_ai.install(_server)
muawin_services.install(_server)
course_setup_automation.install(_server)
class_mode_api.install(_server)

app = _server.app
