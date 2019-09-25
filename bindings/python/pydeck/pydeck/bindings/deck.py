import os
import warnings

from .json_tools import JSONMixin
from .layer import Layer
from .view import View
from .view_state import ViewState
from ..io.html import deck_to_html
from ..widget import DeckGLWidget


class Deck(JSONMixin):
    """The renderer and configuration for a visualization"""
    def __init__(
        self,
        layers=[],
        views=[View()],
        map_style='mapbox://styles/mapbox/dark-v9',
        mapbox_key=None,
        initial_view_state=ViewState(),
        width="100%",
        height=500,
        tooltip=True,
    ):
        """
        Constructor for a Deck object, similar to the `Deck`_ class from deck.gl

        Requires a Mapbox API token to display a basemap, see notes below.

        Parameters
        ----------
        layers : pydeck.Layer or list of pydeck.Layer, default []
            List of :class:`pydeck.Layer` layers to render.
        views : list of pydeck.View, default [pydeck.View()]
            List of :class:`pydeck.View` objects to render.
        map_style : str, default "mapbox://styles/mapbox/dark-v9"
            URI for Mapbox basemap style. See Mapbox's gallery_ for examples.
        initial_view_state : pydeck.ViewState, default pydeck.ViewState()
            Initial camera angle relative to the map, defaults to a fully zoomed out 0, 0-centered map
            To compute a viewport from data, see :func:`pydeck.data_utils.compute_view`
        mapbox_key : str, default None
            Read on initialization from the MAPBOX_API_KEY environment variable. Defaults to None if not set.
            See your Mapbox dashboard_.
        height : int or string, default 500
            Width of Jupyter notebook cell, in pixels or, if a string, a CSS width
        width : int` or string, default "100%"
            Width of Jupyter notebook cell, in pixels or, if a string, a CSS width
        tooltip : bool or dict of {str: str}, default True
            If True/False, toggles a default tooltip on visualization hover.
            Layers must have `pickable=True` set in order to display a tooltip.

            For more advanced usage, the user can pass a dict to configure more custom tooltip features:

            The value of the ``html`` key will set the innerHTML_ of the tooltip.
            The value of the ``text`` key will set the innerText_ of the tooltip, overwriting the innerHTML.
            The value of the ``style`` key should be a dictionary of CSS styles and will modify the default
                style of the tooltip.

            A lightweight template syntax is available to both the ``text`` and ``html`` keys,
            using the same conventions as Python's `.format` syntax with variable names.

            Examples:

            .. code-block:: python

            {
                "html": "<b>Elevation Value:</b> {elevationValue}",
                "style": {"backgroundColor": "red", "color": "white"}
            }

            Just setting the text:

            .. code-block:: python

            {
                "text": "Elevation Value: {elevationValue}"
            }


        .. :innerHTML:
            https://developer.mozilla.org/en-US/docs/Web/API/Element/innerHTML
        .. _innerText:
            https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement/innerText
        .. _Deck:
            https://deck.gl/#/documentation/deckgl-api-reference/deck
        .. _gallery:
            https://www.mapbox.com/gallery/
        .. _dashboard:
            https://docs.mapbox.com/help/how-mapbox-works/access-tokens/#mapbox-account-dashboard
        """
        self.layers = []
        if isinstance(layers, Layer):
            self.layers.append(layers)
        else:
            self.layers = layers
        self.views = views
        self.map_style = map_style
        # Use passed view state
        self.initial_view_state = initial_view_state
        self.deck_widget = DeckGLWidget()
        self.mapbox_key = mapbox_key or os.getenv('MAPBOX_API_KEY')
        self.deck_widget.mapbox_key = self.mapbox_key
        self.deck_widget.height = height
        self.deck_widget.width = width
        self.deck_widget.tooltip = tooltip
        if not self.mapbox_key:
            warnings.warn(
                'Mapbox API key is not set. This may impact available features of pydeck.', UserWarning)

    def __add__(self, obj):
        """
        Override of the addition operator to add attributes to the Deck object

        Parameters
        ----------
        obj : object
            pydeck.Layer, pydeck.View, or pydeck.ViewState

        Examples
        --------
        >>> pydeck.Deck() + pydeck.View(controller=False)
        >>> pydeck.Deck()
        {"initialViewState": {"bearing": 0, ... , "views": [{"controller": false, "type": "MapView"}}... }
        """
        if isinstance(obj, Layer):
            self.layers.append(obj)
        elif isinstance(obj, View):
            self.views = [obj]
        elif isinstance(obj, ViewState):
            self.initial_view_state = obj
        else:
            obj_type = type(obj).__name__
            raise TypeError("Cannot join object of type", obj_type)

    @property
    def selected_data(self):
        return self.deck_widget.selected_data

    def show(self):
        """Display current Deck object for a Jupyter notebook"""
        self.update()
        return self.deck_widget

    def update(self):
        """Update a deck.gl map to reflect the current configuration

        For example, if you've modified data passed to Layer and rendered the map using `.show()`,
        you can call `update` to change the data on the map.

        Intended for use in a Jupyter environment.
        """
        self.deck_widget.json_input = self.to_json()

    def to_html(
            self,
            filename=None,
            open_browser=False,
            notebook_display=True,
            iframe_width=700,
            iframe_height=500):
        """Writes a file and loads it to an iframe, if in a Jupyter notebook
        Otherwise writes a file and optionally opens it in a web browser

        The single HTML page uses RequireJS to work, a technology that requires
        Internet access to download the deck.gl libraries that render a visualization.
        In other words, you will need an Internet connection or the visualization will
        not render.

        Parameters
        ----------
        filename : str, default None
            Name of the file. If no name is provided, a randomly named file will be written locally.
        open_browser : bool, default False
            Whether a browser window will open or not after write
        notebook_display : bool, default True
            Attempts to display the HTML output in an iframe if True. Only works in a Jupyter environment.
        iframe_width : int, default 700
            Height of Jupyter notebook iframe in pixels, if rendered in a Jupyter environment.
        iframe_height : int, default 700
            Width of Jupyter notebook iframe in pixels, if rendered in a Jupyter environment.

        Returns
        -------
            str : Returns absolute path of the file
        """
        json_blob = self.to_json()
        f = deck_to_html(
            json_blob,
            self.mapbox_key,
            filename,
            open_browser=open_browser,
            notebook_display=notebook_display,
            iframe_height=iframe_height,
            iframe_width=iframe_width,
            use_tooltip=self.deck_widget.tooltip)
        return f
