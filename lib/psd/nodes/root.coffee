_     = require 'lodash'
Node  = require '../node.coffee'
Group = require './group.coffee'
Layer = require './layer.coffee'

module.exports = class Root extends Node
  @layerForPsd: (psd) ->
    layer = {}
    layer[prop] = null for prop in Node.PROPERTIES

    layer.top = 0
    layer.left = 0
    layer.right = psd.header.width
    layer.bottom = psd.header.height
    layer

  type: 'root'

  constructor: (@psd) ->
    super Root.layerForPsd(@psd)
    @buildHeirarchy()

  documentDimensions: -> [
    @width,
    @height
  ]

  depth: -> 0
  opacity: -> 255
  fillOpacity: -> 255

  export: ->
    title: 'psd upload title'
    description: 'psd upload description'
    type: 'spa'
    createDate: new Date()
    canvasHeight: @height
    canvasWidth: @width
    pages: @_children.map((c) -> c.export())
    document:
      width: @width
      height: @height
      resources:
        layerComps: @psd.resources.resource('layerComps')?.export() or []
        guides: []
        slices: []


  buildHeirarchy: ->
    currentGroup = @
    parseStack = []

    for layer in @psd.layers
      if layer.isFolder()
        parseStack.push currentGroup
        currentGroup = new Group(layer, _.last(parseStack))
      else if layer.isFolderEnd()
        parent = parseStack.pop()
        if parent?
          parent.children().push currentGroup
          currentGroup = parent
      else
        currentGroup.children().push new Layer(layer, currentGroup)

    @updateDimensions()
