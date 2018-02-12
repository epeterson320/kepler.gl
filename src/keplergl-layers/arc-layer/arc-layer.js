import memoize from 'lodash.memoize';

import Layer from '../base-layer';
import ArcBrushingLayer from '../../deckgl-layers/arc-brushing-layer/arc-brushing-layer';
import {hexToRgb} from '../../utils/color-utils';

export const arcPosAccessor = ({lat0, lng0, lat1, lng1}) => d => [
  d.data[lng0.fieldIdx],
  d.data[lat0.fieldIdx],
  0,
  d.data[lng1.fieldIdx],
  d.data[lat1.fieldIdx],
  0
];

export const arcPosResolver = ({lat0, lng0, lat1, lng1}) =>
  `${lat0.fieldIdx}-${lng0.fieldIdx}-${lat1.fieldIdx}-${lat1.fieldIdx}}`;

export const arcRequiredColumns = ['lat0', 'lng0', 'lat1', 'lng1'];

export const arctVisConfigs = {
  opacity: 'opacity',
  thickness: 'thickness',
  colorRange: 'colorRange',
  sizeRange: 'strokeWidthRange',
  targetColor: 'targetColor',
  'hi-precision': 'hi-precision'
};

export default class ArcLayer extends Layer {
  constructor(props) {
    super(props);
    this.registerVisConfig(arctVisConfigs);
    this.getPosition = memoize(arcPosAccessor, arcPosResolver);
  }

  get type() {
    return 'arc';
  }

  get isAggregated() {
    return false;
  }

  get requiredLayerColumns() {
    return arcRequiredColumns;
  }

  get columnPairs() {
    return this.defaultLinkColumnPairs;
  }

  get visualChannels() {
    return {
      ...super.visualChannels,
      size: {
        ...super.visualChannels.size,
        property: 'stroke'
      }
    };
  }

  formatLayerData(_, allData, filteredIndex, oldLayerData, opt = {}) {
    const {
      colorScale,
      colorDomain,
      colorField,
      color,
      columns,
      sizeField,
      sizeScale,
      sizeDomain,
      visConfig: {sizeRange, colorRange, targetColor}
    } = this.config;

    // arc color
    const cScale =
      colorField &&
      this.getVisChannelScale(
        colorScale,
        colorDomain,
        colorRange.colors.map(hexToRgb)
      );

    // arc thickness
    const sScale =
      sizeField && this.getVisChannelScale(sizeScale, sizeDomain, sizeRange);

    const getPosition = this.getPosition(columns);

    if (!oldLayerData || oldLayerData.getPosition !== getPosition) {
      this.updateLayerMeta(allData, getPosition);
    }

    let data;
    if (
      oldLayerData &&
      oldLayerData.data &&
      opt.sameData &&
      oldLayerData.getPosition === getPosition
    ) {
      data = oldLayerData.data;
    } else {
      data = filteredIndex.reduce((accu, index) => {
        const pos = getPosition({data: allData[index]});

        // if doesn't have point lat or lng, do not add the arc
        // deck.gl can't handle position == null
        if (!pos.every(Number.isFinite)) {
          return accu;
        }

        accu.push({
          index,
          sourcePosition: [pos[0], pos[1], pos[2]],
          targetPosition: [pos[3], pos[4], pos[5]],
          data: allData[index]
        });

        return accu;
      }, []);
    }

    const getStrokeWidth = d =>
      sScale ? this.getEncodedChannelValue(sScale, d.data, sizeField) : 1;

    const getColor = d =>
      cScale ? this.getEncodedChannelValue(cScale, d.data, colorField) : color;

    const getTargetColor = d =>
      cScale
        ? this.getEncodedChannelValue(cScale, d.data, colorField)
        : targetColor || color;

    return {
      data,
      getColor,
      getSourceColor: getColor,
      getTargetColor,
      getStrokeWidth
    };
  }

  updateLayerMeta(allData, getPosition) {
    // get bounds from arcs
    const sBounds = this.getPointsBounds(allData, d => {
      const pos = getPosition({data: d});
      return [pos[0], pos[1]];
    });

    const tBounds = this.getPointsBounds(allData, d => {
      const pos = getPosition({data: d});
      return [pos[3], pos[4]];
    });

    const bounds = [
      Math.min(sBounds[0], tBounds[0]),
      Math.min(sBounds[1], tBounds[1]),
      Math.max(sBounds[2], tBounds[2]),
      Math.max(sBounds[3], tBounds[3])
    ];

    this.updateMeta({bounds});
  }

  renderLayer({
    data,
    idx,
    layerInteraction,
    objectHovered,
    mapState,
    interactionConfig
  }) {
    const {brush} = interactionConfig;

    const colorUpdateTriggers = {
      color: this.config.color,
      colorField: this.config.colorField,
      colorRange: this.config.visConfig.colorRange,
      colorScale: this.config.colorScale
    };

    return [
      // base layer
      new ArcBrushingLayer({
        ...layerInteraction,
        ...data,
        id: this.id,
        idx,
        brushRadius: brush.config.size * 1000,
        brushSource: true,
        brushTarget: true,
        enableBrushing: brush.enabled,
        fp64: this.config.visConfig['hi-precision'],
        opacity: this.config.visConfig.opacity,
        pickable: true,
        pickedColor: this.config.highlightColor,
        strokeScale: this.config.visConfig.thickness,
        updateTriggers: {
          getStrokeWidth: {
            sizeField: this.config.sizeField,
            sizeRange: this.config.visConfig.sizeRange
          },
          getColor: colorUpdateTriggers,
          getSourceColor: colorUpdateTriggers,
          getTargetColor: colorUpdateTriggers
        }
      })
    ];
  }
}