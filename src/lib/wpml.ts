import type { Waypoint } from './survey';

// Structure and values follow a mission written by DJI Fly itself for a Mavic 3 (WPML 1.0.2).

export interface MissionOptions {
  altitudeM: number;
  speedMs: number;
  gimbalPitchDeg: number;
  finishAction: 'goHome' | 'noAction';
}

const HEADER =
  '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:wpml="http://www.dji.com/wpmz/1.0.2">';

const fmt = (n: number) => String(Math.round(n * 100) / 100);

function missionConfig(o: MissionOptions): string {
  return `    <wpml:missionConfig>
      <wpml:flyToWaylineMode>safely</wpml:flyToWaylineMode>
      <wpml:finishAction>${o.finishAction}</wpml:finishAction>
      <wpml:exitOnRCLost>executeLostAction</wpml:exitOnRCLost>
      <wpml:executeRCLostAction>goBack</wpml:executeRCLostAction>
      <wpml:globalTransitionalSpeed>${fmt(o.speedMs)}</wpml:globalTransitionalSpeed>
      <wpml:droneInfo>
        <wpml:droneEnumValue>68</wpml:droneEnumValue>
        <wpml:droneSubEnumValue>0</wpml:droneSubEnumValue>
      </wpml:droneInfo>
    </wpml:missionConfig>`;
}

function actionGroup(groupId: number, startIndex: number, endIndex: number, action: string): string {
  return `        <wpml:actionGroup>
          <wpml:actionGroupId>${groupId}</wpml:actionGroupId>
          <wpml:actionGroupStartIndex>${startIndex}</wpml:actionGroupStartIndex>
          <wpml:actionGroupEndIndex>${endIndex}</wpml:actionGroupEndIndex>
          <wpml:actionGroupMode>parallel</wpml:actionGroupMode>
          <wpml:actionTrigger>
            <wpml:actionTriggerType>reachPoint</wpml:actionTriggerType>
          </wpml:actionTrigger>
${action}
        </wpml:actionGroup>`;
}

function gimbalRotate(actionId: number, pitchDeg: number): string {
  return `          <wpml:action>
            <wpml:actionId>${actionId}</wpml:actionId>
            <wpml:actionActuatorFunc>gimbalRotate</wpml:actionActuatorFunc>
            <wpml:actionActuatorFuncParam>
              <wpml:gimbalHeadingYawBase>aircraft</wpml:gimbalHeadingYawBase>
              <wpml:gimbalRotateMode>absoluteAngle</wpml:gimbalRotateMode>
              <wpml:gimbalPitchRotateEnable>1</wpml:gimbalPitchRotateEnable>
              <wpml:gimbalPitchRotateAngle>${fmt(pitchDeg)}</wpml:gimbalPitchRotateAngle>
              <wpml:gimbalRollRotateEnable>0</wpml:gimbalRollRotateEnable>
              <wpml:gimbalRollRotateAngle>0</wpml:gimbalRollRotateAngle>
              <wpml:gimbalYawRotateEnable>0</wpml:gimbalYawRotateEnable>
              <wpml:gimbalYawRotateAngle>0</wpml:gimbalYawRotateAngle>
              <wpml:gimbalRotateTimeEnable>0</wpml:gimbalRotateTimeEnable>
              <wpml:gimbalRotateTime>0</wpml:gimbalRotateTime>
              <wpml:payloadPositionIndex>0</wpml:payloadPositionIndex>
            </wpml:actionActuatorFuncParam>
          </wpml:action>`;
}

function gimbalEvenlyRotate(actionId: number, pitchDeg: number): string {
  return `          <wpml:action>
            <wpml:actionId>${actionId}</wpml:actionId>
            <wpml:actionActuatorFunc>gimbalEvenlyRotate</wpml:actionActuatorFunc>
            <wpml:actionActuatorFuncParam>
              <wpml:gimbalPitchRotateAngle>${fmt(pitchDeg)}</wpml:gimbalPitchRotateAngle>
              <wpml:payloadPositionIndex>0</wpml:payloadPositionIndex>
            </wpml:actionActuatorFuncParam>
          </wpml:action>`;
}

function takePhoto(actionId: number): string {
  return `          <wpml:action>
            <wpml:actionId>${actionId}</wpml:actionId>
            <wpml:actionActuatorFunc>takePhoto</wpml:actionActuatorFunc>
            <wpml:actionActuatorFuncParam>
              <wpml:payloadPositionIndex>0</wpml:payloadPositionIndex>
            </wpml:actionActuatorFuncParam>
          </wpml:action>`;
}

function placemark(
  wp: Waypoint,
  index: number,
  isLast: boolean,
  o: MissionOptions,
  ids: { group: number; action: number },
): string {
  const groups = [actionGroup(ids.group++, index, index, gimbalRotate(ids.action++, o.gimbalPitchDeg))];
  // DJI Fly holds the gimbal angle along each leg with a group spanning this waypoint and the next.
  if (!isLast) groups.push(actionGroup(ids.group++, index, index + 1, gimbalEvenlyRotate(ids.action++, o.gimbalPitchDeg)));
  if (wp.takePhoto) groups.push(actionGroup(ids.group++, index, index, takePhoto(ids.action++)));

  // DJI Fly's own default is a curved path (useStraightLine 0); survey lines must be straight.
  return `      <Placemark>
        <Point>
          <coordinates>
            ${wp.lng.toFixed(9)},${wp.lat.toFixed(9)}
          </coordinates>
        </Point>
        <wpml:index>${index}</wpml:index>
        <wpml:executeHeight>${fmt(o.altitudeM)}</wpml:executeHeight>
        <wpml:waypointSpeed>${fmt(o.speedMs)}</wpml:waypointSpeed>
        <wpml:waypointHeadingParam>
          <wpml:waypointHeadingMode>followWayline</wpml:waypointHeadingMode>
          <wpml:waypointHeadingAngle>0</wpml:waypointHeadingAngle>
          <wpml:waypointPoiPoint>0.000000,0.000000,0.000000</wpml:waypointPoiPoint>
          <wpml:waypointHeadingAngleEnable>1</wpml:waypointHeadingAngleEnable>
          <wpml:waypointHeadingPathMode>followBadArc</wpml:waypointHeadingPathMode>
        </wpml:waypointHeadingParam>
        <wpml:waypointTurnParam>
          <wpml:waypointTurnMode>toPointAndStopWithDiscontinuityCurvature</wpml:waypointTurnMode>
          <wpml:waypointTurnDampingDist>0</wpml:waypointTurnDampingDist>
        </wpml:waypointTurnParam>
        <wpml:useStraightLine>1</wpml:useStraightLine>
${groups.join('\n')}
      </Placemark>`;
}

/** wpmz/waylines.wpml: the route the aircraft executes. */
export function buildWaylines(waypoints: Waypoint[], o: MissionOptions): string {
  const ids = { group: 1, action: 1 };
  const placemarks = waypoints.map((wp, i) => placemark(wp, i, i === waypoints.length - 1, o, ids)).join('\n');
  // DJI Fly writes distance and duration as 0 and computes them itself.
  return `${HEADER}
  <Document>
${missionConfig(o)}
    <Folder>
      <wpml:templateId>0</wpml:templateId>
      <wpml:executeHeightMode>relativeToStartPoint</wpml:executeHeightMode>
      <wpml:waylineId>0</wpml:waylineId>
      <wpml:distance>0</wpml:distance>
      <wpml:duration>0</wpml:duration>
      <wpml:autoFlightSpeed>${fmt(o.speedMs)}</wpml:autoFlightSpeed>
${placemarks}
    </Folder>
  </Document>
</kml>
`;
}

/** wpmz/template.kml: DJI Fly writes only mission-level config here. */
export function buildTemplate(o: MissionOptions, nowMs: number = Date.now()): string {
  return `${HEADER}
  <Document>
    <wpml:author>fly</wpml:author>
    <wpml:createTime>${nowMs}</wpml:createTime>
    <wpml:updateTime>${nowMs}</wpml:updateTime>
${missionConfig(o)}
  </Document>
</kml>
`;
}
