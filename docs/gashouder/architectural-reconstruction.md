# Gashouder architectural reconstruction

## Evidence and confidence

The model is a reference-based visual reconstruction, not an as-built survey.
Dimensions below come from the venue's published technical specifications and
the 2022 technical plan; the plan is used for the 40 perimeter-bay count and
interior roof-member arrangement.

| Feature | Basis | Confidence in this build |
| --- | --- | --- |
| Approx. 53.8 m exterior diameter | Published venue specification (~54 m) | High for approximate scale |
| 10 m outer ring / wall height | Published venue specification | High for vertical datum |
| 14.5 m centre height | Published venue specification | High for vertical datum |
| 40 perimeter bays | 2022 technical plan, page 7 | High for count; low for exact bay profile |
| Radial roof members and circular reinforcement | 2022 technical plan, page 4 interior image | High for visual arrangement |
| 18 × 9 × 1.8 m main stage | Published technical specification | High for nominal size |
| Polygon thickness, roof cross-section, roof skin/profile, beam sections | Not dimensioned in the available references | Inferred |
| Main/loading door size and exact placement | Reconstructed from the plan illustration | Inferred |
| Event-ring dimensions and fixture positions | Adapted from the cited event reference and required stage sightlines | Inferred |
| Basement and current service entrances | Current as-built plan not available in the evidence set | Not reconstructed |

References:

- [Gashouder technical specifications](https://gashouder.nl/technical-specs)
- [2022 venue technical plan](https://uniquevenuesofamsterdam.com/wp-content/uploads/2021/07/Gashouder_ENG_Januari_2022.pdf)
- [Awakenings ADE 2024 lighting case](https://wahlberg.dk/blogs/cases/awakenings-ade-2024)

The 2024 lighting case is a visual/technical reference for an overhead LED
installation. Its reported 98 winches and 49 LED strips are not a surveyed
Gashouder building datum and are not represented as a complete motion-control
reconstruction here.

## Coordinate system

All dimensions are metres. The hall floor centre is `(0, 0, 0)`; `y` is up.
The main hall is a 40-sided approximation with an inner wall radius of 26.4 m
(the published 53.8 m diameter is rounded down by the shell thickness). The
main door is on the `+z` side; the loading opening is opposite. The stage is
centred at `(0, -19.5)`, so its front edge faces the `+z` dance-floor area.

The wall runs to `y=10`. The roof panels use an inferred straight radial profile
from the outer ring at `y=10` to a central hub at `y=14.5`. Forty steel radial
members and several circular rings echo the technical drawing; their member
dimensions and elevations are illustrative.

## Doors and circulation

The scene leaves two nominal 3 m wide by 4 m high openings in opposite wall
bays. Brick jambs and lintels form the openings; piers are placed at bay
junctions, rather than through the centre of a bay or door. These opening
dimensions are reconstruction parameters, not dimensions from a current
door schedule.

For navigation, the 1.8 m stage has six 0.3 m risers over a 3 m run. This is a
walkable access approximation added for desktop and XR interaction; it should
not be read as a claim about the venue's actual stage stairs or ramp.

## Known omissions

The current build does not reconstruct the detailed radial arches, fixed bar,
balcony/mezzanine, underground facility entrances, or the reported basement
addition. It has no current basement/as-built reference to verify those forms.
The separately documented venue-specific rig and animated strips are event
visuals, not permanent building architecture.
